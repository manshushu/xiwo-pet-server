@cd /d "%~dp0"
@echo off
echo [Xiwo Pet v2.1.0] Stopping any previous server on ports 3001 and 3000...
powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001,3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
set "NODE_BIN=%~dp0runtime\node.exe"
if not exist "%NODE_BIN%" set "NODE_BIN=node"
echo [Xiwo Pet v2.1.0] Starting server with: %NODE_BIN%
"%NODE_BIN%" src\server.js
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start server. Check Node.js runtime.
    pause
)