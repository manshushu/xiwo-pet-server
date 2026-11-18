@cd /d "%~dp0"
@echo off
title Xiwo Pet v2.1.0 - Service Manager
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\manage_service.ps1" %*
pause
exit /b %ERRORLEVEL%