@echo off
REM Double-click me on Windows to start Club Thirty.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet. Opening the download page: install the LTS version, then double-click this file again.
  start https://nodejs.org/
  pause
  exit /b 1
)
node server.js
pause
