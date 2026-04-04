@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0docker-down.ps1" %*
endlocal
