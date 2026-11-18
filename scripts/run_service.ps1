$ErrorActionPreference = 'Continue'
$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir

# Single-instance watchdog mutex so 1-minute scheduled task checks never spawn duplicates
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Global\XiwoPetWatchdogMutex', [ref]$createdNew)
if (-not $createdNew) {
    exit 0
}

$LogDir = Join-Path $AppDir 'logs'
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$ServiceLog = Join-Path $LogDir 'service.log'
$OutLog = Join-Path $LogDir 'server_stdout.log'
$ErrLog = Join-Path $LogDir 'server_stderr.log'

function Write-SvcLog($msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $ServiceLog -Value "[$ts] $msg" -Encoding UTF8
}

function Rotate-Log($path, $maxBytes) {
    if ((Test-Path $path) -and ((Get-Item $path).Length -gt $maxBytes)) {
        $bak = "$path.old"
        if (Test-Path $bak) { Remove-Item $bak -Force -ErrorAction SilentlyContinue }
        Move-Item $path $bak -Force -ErrorAction SilentlyContinue
    }
}

function Get-TargetPort {
    $cfgPath = Join-Path $AppDir 'data\config.json'
    if (Test-Path $cfgPath) {
        try {
            $cfg = Get-Content -Path $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($cfg -and $cfg.port) {
                return [int]$cfg.port
            }
        } catch {}
    }
    return 3001
}

function Stop-OrphanNode {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.CommandLine -and ($_.CommandLine -like "*src*server.js*")) {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

function Test-ServerHealthy($port) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/student/" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400)
    } catch {
        return $false
    }
}

try {
    Stop-OrphanNode

    $bundledNode = Join-Path $AppDir 'runtime\node.exe'
    $nodeCmd = if (Test-Path $bundledNode) { $bundledNode } else { (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
    if (-not $nodeCmd) {
        $nodeCmd = 'C:\Program Files\nodejs\node.exe'
    }

    $port = Get-TargetPort
    Write-SvcLog "Watchdog started with HTTP health check. AppDir=$AppDir Node=$nodeCmd Port=$port"

    while ($true) {
        Rotate-Log $ServiceLog 5MB
        Rotate-Log $OutLog 10MB
        Rotate-Log $ErrLog 10MB

        $port = Get-TargetPort
        Write-SvcLog "Starting src\server.js on port $port..."
        $proc = Start-Process -FilePath $nodeCmd `
            -ArgumentList 'src\server.js' `
            -WorkingDirectory $AppDir `
            -WindowStyle Hidden `
            -RedirectStandardOutput $OutLog `
            -RedirectStandardError $ErrLog `
            -PassThru

        # Startup grace period before probing HTTP
        $failCount = 0
        $graceRemaining = 15
        while (-not $proc.HasExited -and $graceRemaining -gt 0) {
            Start-Sleep -Seconds 3
            $graceRemaining -= 3
        }

        while (-not $proc.HasExited) {
            Start-Sleep -Seconds 15
            if ($proc.HasExited) { break }

            if (Test-ServerHealthy $port) {
                $failCount = 0
            } else {
                $failCount++
                Write-SvcLog "Health check failed ($failCount/3) on http://127.0.0.1:$port/student/"
                if ($failCount -ge 3) {
                    Write-SvcLog "Server unresponsive for 3 consecutive checks. Killing PID $($proc.Id) to restart..."
                    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
                    Stop-OrphanNode
                    break
                }
            }
        }

        if ($proc.HasExited) {
            Write-SvcLog "node.exe exited with code $($proc.ExitCode). Restarting in 3s..."
        } else {
            Write-SvcLog "Restarting unresponsive server in 3s..."
        }
        Start-Sleep -Seconds 3
    }
} finally {
    try { $mutex.ReleaseMutex() } catch {}
    try { $mutex.Dispose() } catch {}
}
