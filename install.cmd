@echo off
setlocal

set "VERSION=%~1"
if "%VERSION%"=="" set "VERSION=latest"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PowerShell is required.
  exit /b 1
)

set "REPO=Vegetog/RustCloud"
if not "%RUSTCLOUD_REPO%"=="" set "REPO=%RUSTCLOUD_REPO%"

set "PS_SCRIPT=%TEMP%\rustcloud-install-%RANDOM%%RANDOM%.ps1"
set "SCRIPT_URL=https://raw.githubusercontent.com/%REPO%/main/install.ps1"

echo [INFO] Downloading installer from %SCRIPT_URL% ...
curl -fsSL "%SCRIPT_URL%" -o "%PS_SCRIPT%"
if errorlevel 1 (
  echo [ERROR] Failed to download install.ps1
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -Version "%VERSION%"
set "EXIT_CODE=%ERRORLEVEL%"

del "%PS_SCRIPT%" >nul 2>nul
exit /b %EXIT_CODE%
