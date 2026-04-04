@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0docker-logs.ps1" %*
endlocal
