[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = '电子宠物积分系统 v2 - 后台服务管理'
$AppDir = Split-Path -Parent $PSScriptRoot
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
        Write-Host '注册或更新系统后台服务需要管理员权限，请右键以管理员身份运行！' -ForegroundColor Red
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
    Write-Host '  电子宠物积分系统 v2 - 持久化后台服务状态' -ForegroundColor Green
    Write-Host '==================================================' -ForegroundColor Cyan
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        $taskExe = ($task.Actions | Select-Object -First 1).Execute
        if ($taskExe -eq $RunBat) {
            Write-Host "计划任务状态: $($task.State)" -ForegroundColor Yellow
        } else {
            Write-Host "计划任务状态: $($task.State) (路径不一致，按 1 重启时将自动修正)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "计划任务状态: 未安装 ($TaskName) - 按 1 启动时将自动注册" -ForegroundColor Yellow
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
    Write-Host '请选择操作: [1] 启动/重启服务  [2] 停止服务  [3] 查看最近日志  [0] 退出'
    $choice = Read-Host '输入数字'
    if ($choice -eq '1') {
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
            Write-Host '服务仍在启动中或启动异常，请按 3 查看日志。' -ForegroundColor Yellow
        }
    } elseif ($choice -eq '2') {
        try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
        Stop-PetProcesses
        Write-Host '✔ 服务已停止（注意：若计划任务仍启用，1分钟后巡检会重新拉起；如需彻底停用请在任务计划程序中禁用 XiwoPetServer）。' -ForegroundColor Yellow
    } elseif ($choice -eq '3') {
        $svcLog = Join-Path $AppDir 'logs\service.log'
        $errLog = Join-Path $AppDir 'logs\server_stderr.log'
        if (Test-Path $svcLog) {
            Write-Host '--- 守护日志 (service.log 最后 20 行) ---' -ForegroundColor Cyan
            Get-Content $svcLog -Tail 20 -Encoding UTF8
        }
        if (Test-Path $errLog) {
            Write-Host '--- 错误日志 (server_stderr.log 最后 20 行) ---' -ForegroundColor Red
            Get-Content $errLog -Tail 20 -Encoding UTF8
        }
    } elseif ($choice -eq '0') {
        break
    }
}
