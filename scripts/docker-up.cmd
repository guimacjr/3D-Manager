@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0docker-up.ps1" %*
endlocal
