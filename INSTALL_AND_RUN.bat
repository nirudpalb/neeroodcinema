@echo off
setlocal
title NEEROOD CINEMA - Install and Run
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install the current Node.js LTS from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing NEEROOD CINEMA dependencies. This may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
call npm start
