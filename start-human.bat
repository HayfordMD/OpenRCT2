@echo off
setlocal

echo Starting OpenRCT2 Sandbox Protocol...
echo.

echo Cleaning up ghost Python instances to free port 1337...
taskkill /IM python.exe /F 2>nul

echo Launching Human UI Interceptor...
start "Human Interceptor" cmd /k "python ai-engine\human_logger.py"

ping 127.0.0.1 -n 3 > nul

echo Launching OpenRCT2 Visual Instance...
call run-ai-visual.bat "C:\Users\hayfo\source\OpenRCT2\benchmark-data\save\Electric Fields-human.SV6"
