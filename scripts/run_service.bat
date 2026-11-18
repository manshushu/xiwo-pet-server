@cd /d "%~dp0"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0run_service.ps1"
exit /b %ERRORLEVEL%