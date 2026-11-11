@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8835 in your browser.
echo Keep this window open. To stop, press Ctrl+C.
node server.mjs
pause
