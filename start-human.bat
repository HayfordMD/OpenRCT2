@echo off
setlocal

echo Starting OpenRCT2 Sandbox Protocol...
echo.

echo Cleaning up ghost Python instances to free port 1337...
taskkill /IM python.exe /F 2>nul

echo Launching Human UI Interceptor...
start "Human Interceptor" cmd /k "python ai-engine\human_logger.py"

timeout /t 1 /nobreak >nul

echo Launching OpenRCT2 Visual Instance...
call run-ai-visual.bat
