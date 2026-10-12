@echo off
cd /d "%~dp0"
chcp 65001 >nul
title InThread Cheatkey by TAKOH - Helper Server
cls

echo ============================================================
echo      InThread Cheatkey by TAKOH - Local Helper Server
echo ============================================================
echo.

:: Do not terminate unrelated programs listening on the helper port.

echo [INFO] Starting TAKOH Helper Server (app.py)...
echo * Keep this window open while downloading videos!
echo * Local API Endpoint: http://127.0.0.1:5005/download
echo ------------------------------------------------------------
echo.

if exist "TAKOH_Helper.exe" (
    TAKOH_Helper.exe
    goto finished
)
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "import flask, flask_cors, yt_dlp, requests" >nul 2>&1
    if not errorlevel 1 (
        ".venv\Scripts\python.exe" app.py
        goto finished
    )
)
python app.py
if %errorlevel% neq 0 (
    echo.
    echo [NOTICE] Python app.py stopped. Falling back to TAKOH_Helper.exe...
    if exist "TAKOH_Helper.exe" (
        TAKOH_Helper.exe
    )
)

:finished
echo.
echo [INFO] Server stopped. Press any key to exit...
pause
