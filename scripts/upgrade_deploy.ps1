param(
    [string]$TargetDir = "",
    [switch]$NoPause,
    [switch]$SkipStart
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$SourceDir = Split-Path -Parent $PSScriptRoot
$TaskName = 'XiwoPetServer'

function Test-IsAdmin {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {
        return $false
    }
}

function Test-HasInstalledApp([string]$dir) {
    if ([string]::IsNullOrWhiteSpace($dir) -or -not (Test-Path -LiteralPath $dir -PathType Container)) {
        return $false
    }
    $hasServer = Test-Path -LiteralPath (Join-Path $dir 'src\server.js') -PathType Leaf
    $hasStudentsData = Test-Path -LiteralPath (Join-Path $dir 'data\students.json') -PathType Leaf
    return ($hasServer -and $hasStudentsData)
}

function Test-IsValidTargetDir([string]$dir) {
    if ([string]::IsNullOrWhiteSpace($dir) -or -not (Test-Path -LiteralPath $dir -PathType Container)) {
        return $false
    }
    $hasServer = Test-Path -LiteralPath (Join-Path $dir 'src\server.js') -PathType Leaf
    $hasData = Test-Path -LiteralPath (Join-Path $dir 'data') -PathType Container
    $hasPkg = Test-Path -LiteralPath (Join-Path $dir 'package.json') -PathType Leaf
    return ($hasServer -and ($hasData -or $hasPkg))
}

function Get-DataSnapshot([string]$dataDir) {
    $map = @{}
    if (-not (Test-Path -LiteralPath $dataDir -PathType Container)) {
        return $map
    }
    $baseLen = $dataDir.TrimEnd('\', '/').Length + 1
    Get-ChildItem -LiteralPath $dataDir -Recurse -File -Force | ForEach-Object {
        $rel = $_.FullName.Substring($baseLen)
        $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        $map[$rel] = $hash
    }
    return $map
}

function Select-TargetDirInteractive {
    Add-Type -AssemblyName System.Windows.Forms
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = '请选择原有的电子宠物积分系统程序目录（包含 src 和 data 文件夹）'
    $dlg.ShowNewFolderButton = $false
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dlg.SelectedPath
    }
    return ''
}

function Resolve-TargetDeployDir([string]$explicitDir) {
    if (-not [string]::IsNullOrWhiteSpace($explicitDir)) {
        $cleaned = $explicitDir.Trim().Trim('"')
        if (-not (Test-Path -LiteralPath $cleaned -PathType Container)) {
            throw "指定的目标目录不存在：$cleaned"
        }
        return (Resolve-Path -LiteralPath $cleaned).Path
    }

    # 1. Scheduled task path
    try {
        $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existingTask) {
            $exePath = ($existingTask.Actions | Select-Object -First 1).Execute
            if ($exePath -and (Test-Path -LiteralPath $exePath)) {
                $cand = Split-Path -Parent (Split-Path -Parent $exePath)
                if (Test-HasInstalledApp $cand) {
                    return (Resolve-Path -LiteralPath $cand).Path
                }
            }
        }
    } catch {}

    # 2. Running node.exe / run_service.ps1 path
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='powershell.exe'" -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            $cmd = $p.CommandLine
            if (-not $cmd) { continue }
            if ($cmd -match '([A-Za-z]:\\[^"\r\n]+?)\\(?:src\\server\.js|scripts\\run_service\.ps1)') {
                $cand = $matches[1].TrimEnd('\')
                if (Test-HasInstalledApp $cand) {
                    return (Resolve-Path -LiteralPath $cand).Path
                }
            }
        }
    } catch {}

    # 3. Current directory itself (only if it already has data\students.json)
    if (Test-HasInstalledApp $SourceDir) {
        return (Resolve-Path -LiteralPath $SourceDir).Path
    }

    # 4. Parent directory and sibling directories (skipping backups/dist_update)
    $parentDir = Split-Path -Parent $SourceDir
    if ($parentDir) {
        if (Test-HasInstalledApp $parentDir) {
            return (Resolve-Path -LiteralPath $parentDir).Path
        }
        foreach ($named in @('电子宠物积分系统', 'v2')) {
            $cand = Join-Path $parentDir $named
            if (($cand.TrimEnd('\') -ine $SourceDir.TrimEnd('\')) -and (Test-HasInstalledApp $cand)) {
                return (Resolve-Path -LiteralPath $cand).Path
            }
        }
        try {
            $siblings = Get-ChildItem -LiteralPath $parentDir -Directory -ErrorAction SilentlyContinue
            foreach ($sb in $siblings) {
                if ($sb.FullName.TrimEnd('\') -ieq $SourceDir.TrimEnd('\')) { continue }
                if ($sb.Name -match '^(backups|_upgrade_backup|dist_update)$') { continue }
                if (Test-HasInstalledApp $sb.FullName) {
                    return (Resolve-Path -LiteralPath $sb.FullName).Path
                }
            }
        } catch {}
    }

    # 5. Common default install paths
    foreach ($defPath in @('D:\在玩\电子宠物积分系统', 'D:\电子宠物积分系统', 'C:\电子宠物积分系统')) {
        if (($defPath.TrimEnd('\') -ine $SourceDir.TrimEnd('\')) -and (Test-HasInstalledApp $defPath)) {
            return (Resolve-Path -LiteralPath $defPath).Path
        }
    }

    # 6. FolderBrowserDialog fallback when interactive
    if (-not $NoPause) {
        Write-Host '未在默认路径自动检测到已有部署目录，请在弹窗中手动选择原程序目录...' -ForegroundColor Yellow
        $picked = Select-TargetDirInteractive
        if (-not [string]::IsNullOrWhiteSpace($picked) -and (Test-IsValidTargetDir $picked)) {
            return (Resolve-Path -LiteralPath $picked).Path
        }
    }

    throw '未能定位到原有的电子宠物积分系统目录。请将升级包解压至原目录同级文件夹，或使用 -TargetDir 参数指定。'
}

function Get-TargetPort([string]$baseDir) {
    $cfgPath = Join-Path $baseDir 'data\config.json'
    if (Test-Path -LiteralPath $cfgPath) {
        try {
            $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($cfg -and $cfg.port) { return [int]$cfg.port }
        } catch {}
    }
    return 3001
}

function Stop-PetProcesses([int]$port) {
    Write-Host "[2/5] 正在停止旧服务与占用 $port 端口的进程..." -ForegroundColor Yellow
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
    Write-Host '  ✔ 旧服务已停止' -ForegroundColor Green
}

Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '     电子宠物积分系统 v2.1.0 - 一键增量升级部署工具（保数据）   ' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host "当前升级包目录: $SourceDir" -ForegroundColor Gray

if (Test-Path -LiteralPath (Join-Path $SourceDir 'data')) {
    # When running inside an already deployed directory that owns data/, TargetDir == SourceDir is fine,
    # otherwise never accidentally overwrite another directory's data.
}

$ResolvedTarget = Resolve-TargetDeployDir $TargetDir
$oldVerFile = Join-Path $ResolvedTarget 'VERSION'
$oldVer = if (Test-Path -LiteralPath $oldVerFile) { (Get-Content -LiteralPath $oldVerFile -Raw).Trim() } else { '未知版本' }
Write-Host "[1/5] 已自动定位原部署目录: $ResolvedTarget (版本: $oldVer -> 2.1.0)" -ForegroundColor Green

$TargetData = Join-Path $ResolvedTarget 'data'
$beforeDataHash = Get-DataSnapshot $TargetData
Write-Host "  ✔ 原 data 目录快照完成：共 $($beforeDataHash.Count) 个文件，升级过程绝不修改原有数据" -ForegroundColor Cyan

$port = Get-TargetPort $ResolvedTarget
if (-not $SkipStart) {
    Stop-PetProcesses $port
} else {
    Write-Host '[2/5] 跳过端口停止步骤 (-SkipStart)' -ForegroundColor Gray
}

# 3. Backup existing data/ and src/
Write-Host '[3/5] 正在备份原有数据与旧版程序文件...' -ForegroundColor Yellow
$BackupDir = Join-Path $ResolvedTarget ('backups\upgrade_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
if (Test-Path -LiteralPath $TargetData) {
    $null = robocopy $TargetData (Join-Path $BackupDir 'data') /E /NFL /NDL /NJH /NJS /NC /NS
}
$TargetSrc = Join-Path $ResolvedTarget 'src'
if (Test-Path -LiteralPath $TargetSrc) {
    $null = robocopy $TargetSrc (Join-Path $BackupDir 'src') /E /NFL /NDL /NJH /NJS /NC /NS
}
foreach ($mf in @('VERSION', 'package.json')) {
    $mp = Join-Path $ResolvedTarget $mf
    if (Test-Path -LiteralPath $mp) {
        Copy-Item -LiteralPath $mp -Destination (Join-Path $BackupDir $mf) -Force
    }
}
Write-Host "  ✔ 已备份至: $BackupDir" -ForegroundColor Green

# 4. Merge program files strictly preserving target data/
Write-Host '[4/5] 正在合并新版程序文件（严格保留原有 data 与 logs）...' -ForegroundColor Yellow
if ($SourceDir.TrimEnd('\') -ine $ResolvedTarget.TrimEnd('\')) {
    foreach ($sub in @('src', 'scripts')) {
        $srcSub = Join-Path $SourceDir $sub
        $dstSub = Join-Path $ResolvedTarget $sub
        if (Test-Path -LiteralPath $srcSub) {
            $null = robocopy $srcSub $dstSub /MIR /NFL /NDL /NJH /NJS /NC /NS
            if ($LASTEXITCODE -ge 8) { throw "同步目录 $sub 失败" }
        }
    }

    if (-not (Test-Path -LiteralPath (Join-Path $ResolvedTarget 'node_modules')) -and (Test-Path -LiteralPath (Join-Path $SourceDir 'node_modules'))) {
        $null = robocopy (Join-Path $SourceDir 'node_modules') (Join-Path $ResolvedTarget 'node_modules') /E /NFL /NDL /NJH /NJS /NC /NS
    }

    $rootFiles = @(
        'package.json', 'package-lock.json', 'index.html', 'VERSION',
        '电子宠物入口.html', '教师大屏入口.html', '查看与管理后台服务.bat',
        '一键安装并启动保活服务.bat', '一键启动电子宠物积分系统.exe',
        '一键升级部署.bat', '一键升级部署.exe',
        '打开学生端.bat', '打开教师大屏.bat', '启动v2新版.bat', '停止服务.bat',
        'start_silent.vbs', 'start_console.bat'
    )
    foreach ($rf in $rootFiles) {
        $srcFile = Join-Path $SourceDir $rf
        if (Test-Path -LiteralPath $srcFile) {
            Copy-Item -LiteralPath $srcFile -Destination (Join-Path $ResolvedTarget $rf) -Force
        }
    }
    Write-Host '  ✔ 程序文件合并完成' -ForegroundColor Green
} else {
    Write-Host '  ✔ 当前已在目标目录中，无需跨目录复制' -ForegroundColor Gray
}

# Verify data/ SHA256 hashes 100% unchanged
$afterDataHash = Get-DataSnapshot $TargetData
if ($beforeDataHash.Count -ne $afterDataHash.Count) {
    throw "校验失败：data 目录文件数量发生意外变化（原 $($beforeDataHash.Count) -> 现 $($afterDataHash.Count)）！"
}
foreach ($k in $beforeDataHash.Keys) {
    if (-not $afterDataHash.ContainsKey($k) -or $afterDataHash[$k] -ne $beforeDataHash[$k]) {
        throw "校验失败：data 文件被意外修改 -> $k"
    }
}
Write-Host "  ✔ data 目录完整性校验通过：原有 $($afterDataHash.Count) 个文件 SHA256 100% 未改变！" -ForegroundColor Green

# 5. Syntax verification and optional restart
Write-Host '[5/5] 正在校验新版代码语法...' -ForegroundColor Yellow
Set-Location $ResolvedTarget
$bundledNode = Join-Path $ResolvedTarget 'runtime\node.exe'
$nodeCmd = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
if (-not $nodeCmd) { $nodeCmd = 'C:\Program Files\nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $nodeCmd)) { throw '未检测到 Node.js，请先在服务器上安装 Node.js' }

$checkTargets = @(
    'src\server.js',
    'src\services\action-limiter.js',
    'src\services\score-helper.js',
    'src\services\data-store.js',
    'src\routes\student.js',
    'src\routes\outfits.js',
    'src\routes\teacher.js',
    'src\ws\ws-server.js',
    'src\public\student\js\student.js',
    'src\public\teacher\js\teacher.js'
)
foreach ($relJs in $checkTargets) {
    $fullJs = Join-Path $ResolvedTarget $relJs
    if (Test-Path -LiteralPath $fullJs) {
        & $nodeCmd -c $fullJs
        if ($LASTEXITCODE -ne 0) { throw "$relJs 语法校验失败" }
    }
}
Write-Host '  ✔ 核心前后端 JS 语法校验全部通过' -ForegroundColor Green

if (-not $SkipStart) {
    $RunBat = Join-Path $ResolvedTarget 'scripts\run_service.bat'
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
    } else {
        Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$RunBat`"" -WorkingDirectory (Split-Path -Parent $RunBat) -WindowStyle Hidden
    }

    $port = Get-TargetPort $ResolvedTarget
    $ready = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            $ready = $true
            break
        }
    }
    if (-not $ready) { throw "服务启动超时，端口 $port 未就绪，请检查 logs\server_stderr.log" }

    $httpResp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/student/" -UseBasicParsing -TimeoutSec 5
    if ($httpResp.StatusCode -lt 200 -or $httpResp.StatusCode -ge 400) { throw 'HTTP 健康检查未通过' }

    Write-Host ''
    Write-Host '=================================================================' -ForegroundColor Cyan
    Write-Host '  🎉 电子宠物积分系统 v2.1.0 升级成功！服务已启动并通过检查！' -ForegroundColor Green
    Write-Host "  运行模式: $(if ($startedByTask) { "系统计划任务 ($TaskName)" } else { '当前用户后台进程' })" -ForegroundColor Gray
    Write-Host "  教师大屏: http://localhost:$port/teacher/" -ForegroundColor Cyan
    Write-Host "  学生端  : http://localhost:$port/student/" -ForegroundColor Yellow
    Write-Host '=================================================================' -ForegroundColor Cyan
} else {
    Write-Host ''
    Write-Host '=================================================================' -ForegroundColor Cyan
    Write-Host '  🎉 电子宠物积分系统 v2.1.0 文件合并与校验完成！(-SkipStart)' -ForegroundColor Green
    Write-Host '=================================================================' -ForegroundColor Cyan
}

if (-not $NoPause) {
    Write-Host ''
    [void](Read-Host '按回车键退出')
}