@echo off
setlocal

set "service=%~1"
if "%service%"=="" set "service=all"
if /I "%service%"=="/help" goto help
if /I "%service%"=="/?" goto help
if /I not "%service%"=="all" if /I not "%service%"=="web" if /I not "%service%"=="agent" goto help_error

powershell.exe -NoProfile -File "%~dp0restart-local-managed.ps1" -Service "%service%"
exit /b %errorlevel%

:help
echo Usage: restart-local.cmd [all^|web^|agent]
echo Services run in the background; readiness is checked before this command exits.
exit /b 0

:help_error
echo Usage: restart-local.cmd [all^|web^|agent]
exit /b 2
