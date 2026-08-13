@echo off
setlocal
set "LAUNCHER_ROOT=%~dp0.."
"%LAUNCHER_ROOT%\runtime\node\node.exe" "%~dp0launcher.mjs" %*
