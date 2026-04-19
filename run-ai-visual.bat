@echo off
setlocal

:: Define paths
set "openrct2Exe=C:\Users\hayfo\source\OpenRCT2\bin\openrct2.exe"
set "pluginSrc=C:\Users\hayfo\.gemini\antigravity\brain\9619dded-8818-4a9a-a924-c8e38cae1446\scratch\ai_bridge.js"
set "userData=C:\Users\hayfo\source\OpenRCT2\benchmark-data"
set "pluginDir=%userData%\plugin"
set "saveFile=S:\SteamLibrary\steamapps\common\Rollercoaster Tycoon 2\Scenarios\ai_test_park.SC6"
set "configFile=%userData%\config.ini"

if not exist "%openrct2Exe%" (
    echo Error: openrct2.exe not found at %openrct2Exe%
    exit /b 1
)

echo Preparing AI Bridge plugin environment...
if not exist "%pluginDir%" mkdir "%pluginDir%"
del /S /Q "%pluginDir%\*.js" >nul
copy /Y "%pluginSrc%" "%pluginDir%\ai_bridge.js" >nul

echo Enforcing 1x UI Speed...
if exist "%configFile%" (
    powershell -Command "(gc '%configFile%') -replace 'uncap_fps = true', 'uncap_fps = false' | Out-File -encoding ASCII '%configFile%'"
)

echo.
echo Launching OpenRCT2 Visual AI Instance...
echo Loading Park: ai_test_park.SC6
echo.
"%openrct2Exe%" "%saveFile%" --user-data-path="%userData%"
