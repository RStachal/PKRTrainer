@echo off
setlocal
cd /d "%~dp0"
set "PORT=8080"
set "URL=http://127.0.0.1:%PORT%/"

where py >nul 2>nul
if %errorlevel% equ 0 (
  start "" "%URL%"
  py -m http.server %PORT% --bind 127.0.0.1
  exit /b %errorlevel%
)

where python >nul 2>nul
if %errorlevel% equ 0 (
  start "" "%URL%"
  python -m http.server %PORT% --bind 127.0.0.1
  exit /b %errorlevel%
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-local.ps1" -Port %PORT%
exit /b %errorlevel%
