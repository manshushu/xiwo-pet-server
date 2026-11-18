@cd /d "%~dp0"
@echo off
title Xiwo Pet v2.1.0 - One-Click Upgrade Deploy
echo ========================================================
echo   Xiwo Pet v2.1.0 - One-Click Upgrade Deploy
echo ========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\upgrade_deploy.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
    echo [ERROR] Upgrade failed with exit code %EXIT_CODE%.
    pause
)
exit /b %EXIT_CODE%