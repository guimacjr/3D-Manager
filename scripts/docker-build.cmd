@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0docker-build.ps1" %*
endlocal
