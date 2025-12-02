@echo off
title Memory Map Fighter Server
echo ==========================================
echo   MEMORY MAP FIGHTER - MULTIPLAYER SERVER
echo ==========================================

cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] First time setup: Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed. Please ensure Node.js is installed.
        pause
        exit /b
    )
)

echo [INFO] Starting server...
echo [INFO] Game will be available at http://localhost:3000
echo [INFO] Waiting for server to initialize...
start "" "http://localhost:3000"
call npm start

pause