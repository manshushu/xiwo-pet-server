[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir
$TaskName = 'XiwoPetServer'
$RunBat = Join-Path $AppDir 'scripts\run_service.bat'

function Test-IsAdmin {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {
        return $false
    }
}

function Get-TargetPort {
    $cfgPath = Join-Path $AppDir 'data\config.json'
    if (Test-Path $cfgPath) {
        try {
            $cfg = Get-Content -Path $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($cfg -and $cfg.port) { return [int]$cfg.port }
        } catch {}
    }
    return 3001
}

Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '         电子宠物积分系统 v2 - 一键自启动与保活部署工具          ' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host "当前程序目录: $AppDir" -ForegroundColor Gray

# 1. Check Node.js & syntax
$bundledNode = Join-Path $AppDir 'runtime\node.exe'
$nodeCmd = if (Test-Path $bundledNode) { $bundledNode } else { (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
if (-not $nodeCmd -or -not (Test-Path $nodeCmd)) {
    throw '未找到 runtime\node.exe 或系统 Node.js，请确认运行环境完整！'
}
& $nodeCmd -c (Join-Path $AppDir 'src\server.js')
if ($LASTEXITCODE -ne 0) { throw 'src\server.js 语法校验失败！' }

# 2. Stop old running instances
$port = Get-TargetPort
Write-Host "[1/3] 正在停止旧服务与占用 $port 端口的进程..." -ForegroundColor Yellow
try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.CommandLine -and $_.CommandLine -like '*电子宠物积分系统*run_service.ps1*') {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.CommandLine -and $_.CommandLine -like '*src*server.js*') {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    if ($_ -and $_ -ne 0) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2

# 3. Register scheduled task & start
Write-Host '[2/3] 正在注册开机自启 + 每分钟巡检保活任务...' -ForegroundColor Yellow
$startedByTask = $false
if (Test-IsAdmin) {
    $action = New-ScheduledTaskAction -Execute $RunBat -WorkingDirectory (Split-Path -Parent $RunBat)
    $triggerStartup = New-ScheduledTaskTrigger -AtStartup
    $triggerWatchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($triggerStartup, $triggerWatchdog) -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    $startedByTask = $true
    Write-Host "  ✔ 已注册计划任务 ($TaskName)：开机自启 + 每分钟巡检 + HTTP 假死重启" -ForegroundColor Green
} else {
    Write-Host '  【提示】当前非管理员权限，仅以后台进程启动。如需开机自启，请右键“以管理员身份运行”或双击“电子宠物控制台.exe”。' -ForegroundColor Yellow
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$RunBat`"" -WorkingDirectory (Split-Path -Parent $RunBat) -WindowStyle Hidden
}

# 4. Health check
Write-Host "[3/3] 正在等待 $port 端口就绪并验证健康状态..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        $ready = $true
        break
    }
}
if (-not $ready) {
    throw "服务启动超时，端口 $port 未就绪，请检查 logs\server_stderr.log"
}

$httpResp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/student/" -UseBasicParsing -TimeoutSec 5
if ($httpResp.StatusCode -lt 200 -or $httpResp.StatusCode -ge 400) {
    throw "HTTP 健康检查异常，状态码: $($httpResp.StatusCode)"
}

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  🎉 电子宠物积分系统 v2 已启动并开启保活！' -ForegroundColor Green
Write-Host "  运行模式: $(if ($startedByTask) { "系统计划任务 ($TaskName)" } else { '当前用户后台进程' })" -ForegroundColor Gray
Write-Host "  教师大屏: http://localhost:$port/teacher/" -ForegroundColor Cyan
Write-Host "  学生端  : http://localhost:$port/student/" -ForegroundColor Yellow
Write-Host '=================================================================' -ForegroundColor Cyan
