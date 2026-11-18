@cd /d "%~dp0"
@echo off
title Xiwo Pet v2.1.0 - Build Update Package
echo ========================================================
echo   Xiwo Pet v2.1.0 - Build Update Package
echo ========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_update_pack.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
    echo [ERROR] Build failed with exit code %EXIT_CODE%.
    pause
)
exit /b %EXIT_CODE%