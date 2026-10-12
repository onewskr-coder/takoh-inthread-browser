@echo off
cd /d "%~dp0"
title InThread Cheatkey - Development Helper
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0start_dev.ps1" %*
if errorlevel 1 pause
