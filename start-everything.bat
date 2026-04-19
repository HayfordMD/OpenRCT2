@echo off
setlocal

echo Starting OpenRCT2 AI Pipeline...
echo.

:: 1. Launch the Python Brain in a new background window
echo Launching Python AI Server...
start "Python AI Brain" cmd /k "python C:\Users\hayfo\.gemini\antigravity\brain\9619dded-8818-4a9a-a924-c8e38cae1446\scratch\ai_server.py"

:: Give the server a tiny fraction of a second to bind to the port
timeout /t 1 /nobreak >nul

:: 2. Launch the Visual Game Instance in the current window
echo Launching OpenRCT2 Visual Instance...
call run-ai-visual.bat
