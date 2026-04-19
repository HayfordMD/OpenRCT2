@echo off
setlocal

:: Define paths
set "openrct2Exe=C:\Users\hayfo\source\OpenRCT2\bin\openrct2-cli.exe"
set "pluginSrc=C:\Users\hayfo\.gemini\antigravity\brain\9619dded-8818-4a9a-a924-c8e38cae1446\scratch\ai_bridge.js"
set "userData=C:\Users\hayfo\source\OpenRCT2\benchmark-data"
set "pluginDir=%userData%\plugin"
set "saveFile=C:\Users\hayfo\source\OpenRCT2\test\tests\testdata\parks\small_park_with_ferris_wheel.sv6"

if not exist "%openrct2Exe%" (
    echo Error: openrct2-cli.exe not found at %openrct2Exe%
    echo Please make sure you have built the engine first!
    exit /b 1
)

echo Preparing AI Bridge plugin environment...
if not exist "%pluginDir%" mkdir "%pluginDir%"
del /S /Q "%pluginDir%\*.js" >nul
copy /Y "%pluginSrc%" "%pluginDir%\ai_bridge.js" >nul

echo.
echo Launching OpenRCT2 AI Headless Instance...
echo Loading Park: small_park_with_ferris_wheel.sv6
echo.
"%openrct2Exe%" "%saveFile%" --user-data-path="%userData%" --headless
