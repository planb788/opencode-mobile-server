@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
title OpenCode Mobile Server - One Click Deploy

if not exist ".env" (
    copy /Y ".env.example" ".env" >nul
    echo Created .env with the default password: opencode
    echo Edit .env before exposing this service to other networks.
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js 18 or newer was not found in PATH.
    pause
    exit /b 1
)

where opencode >nul 2>&1
if errorlevel 1 (
    echo [WARN] The opencode command was not found in PATH.
    echo The PowerShell launcher will reuse an existing server on port 4096 if available.
)

echo Starting OpenCode and the mobile web gateway...
start "OpenCode Mobile Server" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\start-windows.ps1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8787/opencode/"

echo.
echo Local URL: http://127.0.0.1:8787/opencode/
echo LAN URL:   http://YOUR_WINDOWS_LAN_IP:8787/opencode/
echo Run ipconfig to find YOUR_WINDOWS_LAN_IP.
echo Keep the OpenCode Mobile Server window running.
pause
