@echo off
setlocal
cd /d "%~dp0studio-browser"

set "ELECTRON_BIN=%~dp0studio-browser\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_BIN%" (
    set "ELECTRON_BIN=%~dp0..\..\onews-source\studio-browser\node_modules\electron\dist\electron.exe"
)

if not exist "%ELECTRON_BIN%" (
    echo [ERROR] Electron executable not found. > "%~dp0start_debug.log"
    exit /b 1
)

echo Launching: "%ELECTRON_BIN%" in %CD% > "%~dp0start_debug.log"
start "" "%ELECTRON_BIN%" .
echo Start returned errorlevel %ERRORLEVEL% >> "%~dp0start_debug.log"
exit /b 0
