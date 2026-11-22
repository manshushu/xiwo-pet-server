[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$AppDir = Split-Path -Parent $PSScriptRoot
$TaskName = 'XiwoPetServer'
$RunBat = Join-Path $AppDir 'scripts\run_service.bat'

$verFile = Join-Path $AppDir 'VERSION'
$Version = if (Test-Path -LiteralPath $verFile) { (Get-Content -LiteralPath $verFile -Raw).Trim() } else { '2.1.0' }
$Host.UI.RawUI.WindowTitle = "电子宠物积分系统 v$Version - 控制台"

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
    if (Test-Path -LiteralPath $cfgPath) {
        try {
            $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($cfg -and $cfg.port) { return [int]$cfg.port }
        } catch {}
    }
    return 3001
}

function Get-NodeBin {
    $bundledNode = Join-Path $AppDir 'runtime\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { return $bundledNode }
    $sysNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if ($sysNode) { return $sysNode }
    if (Test-Path -LiteralPath 'C:\Program Files\nodejs\node.exe') { return 'C:\Program Files\nodejs\node.exe' }
    return $null
}

function Stop-PetProcesses {
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
}

function Ensure-ScheduledTask {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $needRegister = $false
    if (-not $task) {
        $needRegister = $true
    } else {
        $currentExe = ($task.Actions | Select-Object -First 1).Execute
        if ($currentExe -ne $RunBat) {
            $needRegister = $true
        }
    }
    if (-not $needRegister) { return $true }
    if (-not (Test-IsAdmin)) {
        Write-Host '注册或更新系统后台服务需要管理员权限，请右键“以管理员身份运行”！' -ForegroundColor Red
        return $false
    }
    $action = New-ScheduledTaskAction -Execute $RunBat -WorkingDirectory (Split-Path -Parent $RunBat)
    $triggerStartup = New-ScheduledTaskTrigger -AtStartup
    $triggerWatchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($triggerStartup, $triggerWatchdog) -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "已注册开机自启+每分钟巡检保活任务 ($TaskName)。" -ForegroundColor Green
    return $true
}

function Show-Status {
    $port = Get-TargetPort
    Write-Host ''
    Write-Host '==================================================' -ForegroundColor Cyan
    Write-Host "  电子宠物积分系统 v$Version - 统一管理控制台" -ForegroundColor Green
    Write-Host '==================================================' -ForegroundColor Cyan
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        $taskExe = ($task.Actions | Select-Object -First 1).Execute
        if ($taskExe -eq $RunBat) {
            Write-Host "计划任务状态: $($task.State)" -ForegroundColor Yellow
        } else {
            Write-Host "计划任务状态: $($task.State) (路径不一致，重装或重启时将自动修正)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "计划任务状态: 未安装 ($TaskName)" -ForegroundColor Yellow
    }

    $tcp = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($tcp) {
        Write-Host "$port 端口监听: 正常 (PID: $($tcp.OwningProcess -join ','))" -ForegroundColor Green
    } else {
        Write-Host "$port 端口监听: 未监听" -ForegroundColor Red
    }

    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^169\.254' } | ForEach-Object {
        Write-Host "访问地址: http://$($_.IPAddress):$port/student/  (教师端: /teacher/)" -ForegroundColor Cyan
    }
    Write-Host '--------------------------------------------------' -ForegroundColor Gray
}

while ($true) {
    Show-Status
    Write-Host '请选择操作:' -ForegroundColor White
    Write-Host '  [1] 一键安装并启动保活服务（开机自启 + 后台守护）'
    Write-Host '  [2] 启动 / 重启后台服务'
    Write-Host '  [3] 停止后台服务'
    Write-Host '  [4] 前台调试模式启动（实时查看控制台输出）'
    Write-Host '  [5] 打开学生端网页'
    Write-Host '  [6] 打开教师大屏网页'
    Write-Host '  [7] 查看最近服务日志'
    Write-Host '  [8] 打包升级包（生成到 dist_update\）'
    Write-Host '  [9] 一键升级部署'
    Write-Host '  [0] 退出'
    Write-Host ''
    $choice = (Read-Host '输入数字').Trim()

    if ($choice -eq '1') {
        try {
            & (Join-Path $PSScriptRoot 'install_and_start.ps1')
        } catch {
            Write-Host "执行失败: $($_.Exception.Message)" -ForegroundColor Red
        }
    } elseif ($choice -eq '2') {
        if (-not (Ensure-ScheduledTask)) { continue }
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Stop-PetProcesses
        Start-Sleep -Seconds 1
        Start-ScheduledTask -TaskName $TaskName
        $port = Get-TargetPort
        $started = $false
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Seconds 1
            if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
                $started = $true
                break
            }
        }
        if ($started) {
            Write-Host "✔ 服务已启动，$port 端口监听正常！" -ForegroundColor Green
        } else {
            Write-Host '服务仍在启动中或启动异常，请按 7 查看日志。' -ForegroundColor Yellow
        }
    } elseif ($choice -eq '3') {
        try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
        Stop-PetProcesses
        $port = Get-TargetPort
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        Write-Host '✔ 服务已停止（注意：若计划任务仍启用，1分钟后巡检会重新拉起；如需彻底停用请在任务计划程序中禁用 XiwoPetServer）。' -ForegroundColor Yellow
    } elseif ($choice -eq '4') {
        $nodeBin = Get-NodeBin
        if (-not $nodeBin) {
            Write-Host '未找到 runtime\node.exe 或系统 Node.js，无法启动！' -ForegroundColor Red
            continue
        }
        try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
        Stop-PetProcesses
        $port = Get-TargetPort
        Get-NetTCPConnection -LocalPort $port, 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        Write-Host "正在前台启动服务 ($nodeBin)，按 Ctrl+C 可停止并返回菜单..." -ForegroundColor Cyan
        Push-Location $AppDir
        try {
            & $nodeBin 'src\server.js'
        } finally {
            Pop-Location
        }
    } elseif ($choice -eq '5') {
        $port = Get-TargetPort
        Start-Process "http://localhost:$port/student"
        Write-Host "已打开学生端: http://localhost:$port/student" -ForegroundColor Green
    } elseif ($choice -eq '6') {
        $port = Get-TargetPort
        Start-Process "http://localhost:$port/teacher"
        Write-Host "已打开教师大屏: http://localhost:$port/teacher" -ForegroundColor Green
    } elseif ($choice -eq '7') {
        $svcLog = Join-Path $AppDir 'logs\service.log'
        $errLog = Join-Path $AppDir 'logs\server_stderr.log'
        if (Test-Path -LiteralPath $svcLog) {
            Write-Host '--- 守护日志 (service.log 最后 20 行) ---' -ForegroundColor Cyan
            Get-Content -LiteralPath $svcLog -Tail 20 -Encoding UTF8
        } else {
            Write-Host '暂无 service.log' -ForegroundColor Gray
        }
        if (Test-Path -LiteralPath $errLog) {
            Write-Host '--- 错误日志 (server_stderr.log 最后 20 行) ---' -ForegroundColor Red
            Get-Content -LiteralPath $errLog -Tail 20 -Encoding UTF8
        }
    } elseif ($choice -eq '8') {
        try {
            & (Join-Path $PSScriptRoot 'build_update_pack.ps1') -NoPause
        } catch {
            Write-Host "打包失败: $($_.Exception.Message)" -ForegroundColor Red
        }
    } elseif ($choice -eq '9') {
        try {
            & (Join-Path $PSScriptRoot 'upgrade_deploy.ps1')
        } catch {
            Write-Host "升级失败: $($_.Exception.Message)" -ForegroundColor Red
        }
    } elseif ($choice -eq '0') {
        break
    } else {
        Write-Host '无效选项，请输入 0-9。' -ForegroundColor Yellow
    }
}
