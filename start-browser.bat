@echo off
setlocal
cd /d "%~dp0studio-browser"

set "ELECTRON_BIN=%~dp0studio-browser\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_BIN%" (
    set "ELECTRON_BIN=%~dp0..\..\studio-browser\node_modules\electron\dist\electron.exe"
)
if not exist "%ELECTRON_BIN%" (
    set "ELECTRON_BIN=%~dp0..\..\onews-source\studio-browser\node_modules\electron\dist\electron.exe"
)

if not exist "%ELECTRON_BIN%" (
    echo [ERROR] Electron executable not found. > "%~dp0start_debug.log"
    exit /b 1
)

if /I "%~1"=="--create-shortcut" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\TAKOH Studio Browser.lnk'); $s.TargetPath = '%~f0'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = '%ELECTRON_BIN%,0'; $s.Description = 'TAKOH In-Thread Browser & Content Studio'; $s.Save()"
    echo Desktop shortcut created: TAKOH Studio Browser.lnk
    exit /b 0
)

echo Launching: "%ELECTRON_BIN%" in %CD% > "%~dp0start_debug.log"
start "" "%ELECTRON_BIN%" .
echo Start returned errorlevel %ERRORLEVEL% >> "%~dp0start_debug.log"
exit /b 0
