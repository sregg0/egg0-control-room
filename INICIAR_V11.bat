@echo off
cd /d "%~dp0"
title SREGGO Control Room V15
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js no esta instalado o no esta en PATH.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
echo.
echo ===============================================
echo SREGGO CONTROL ROOM V15
echo Panel:  http://localhost:5173/
echo Output: http://localhost:5173/output
echo ===============================================
echo.
call npm run dev
pause
