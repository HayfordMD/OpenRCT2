@echo off
setlocal

echo Starting OpenRCT2 Machine Learning Protocol...
echo.

echo Cleaning up ghost Python instances to free port 1337...
taskkill /IM python.exe /F 2>nul

echo Launching Python Deep Learning Training Engine...
start "Python AI Brain" cmd /k "python ai-engine\train.py"

timeout /t 1 /nobreak >nul

echo Launching OpenRCT2 Visual Instance...
call run-ai-visual.bat
