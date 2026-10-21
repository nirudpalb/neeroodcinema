@echo off
setlocal
title NEEROOD CINEMA - Build Installer
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS first: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 pause & exit /b 1
)
call npm run dist
if errorlevel 1 (
  echo Build failed. See errors above.
  pause
  exit /b 1
)
echo Installer created inside the dist folder.
pause
