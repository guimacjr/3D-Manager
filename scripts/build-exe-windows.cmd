@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0build-exe-windows.ps1" %*
