@cd /d "%~dp0"
@echo off
title Xiwo Pet v2.1.0 - Install and Start Service
echo ========================================================
echo   Xiwo Pet v2.1.0 - Install Auto-Start Watchdog Service
echo ========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install_and_start.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
    echo [ERROR] Failed with exit code %EXIT_CODE%.
)
pause
exit /b %EXIT_CODE%