@echo off
chcp 65001 > nul
cls
echo ========================================================
echo   [InThread Cheat] Dashboard Server
echo   URL: http://localhost:5173/dashboard?onboarding=1
echo ========================================================
echo.
node server.js
pause
