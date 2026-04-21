@echo off
setlocal

echo Starting Phase 15 Architect Specialization Matrix...
echo.

echo Cleaning up ghost Python instances to free port 1337...
taskkill /IM python.exe /F 2>nul

echo Launching The Architect Neural Array (train_architect.py)...
start "Architect Brain" cmd /k "python ai-engine\train_architect.py"

ping 127.0.0.1 -n 12 > nul

echo Launching OpenRCT2 Visual Instance...
call run-ai-visual.bat "S:\SteamLibrary\steamapps\common\Rollercoaster Tycoon 2\Scenarios\Electric Fields.SC6"
