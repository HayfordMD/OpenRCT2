@echo off
echo ===================================================
echo OpenRCT2 AI Speed Benchmark
echo ===================================================

set "userData=C:\Users\hayfo\source\OpenRCT2\benchmark-data"
set "pluginDir=%userData%\plugin"
set "binDir=C:\Users\hayfo\source\OpenRCT2\bin"
set "parkFile=%binDir%\testdata\parks\small_park_with_ferris_wheel.sv6"
set "pluginSrc=C:\Users\hayfo\.gemini\antigravity\brain\9619dded-8818-4a9a-a924-c8e38cae1446\scratch\benchmark_plugin.js"

echo Preparing benchmark plugin environment...
if not exist "%pluginDir%" mkdir "%pluginDir%"
copy /Y "%pluginSrc%" "%pluginDir%\benchmark_plugin.js" >nul

echo Preparing engine config to uncap FPS...
echo [general] > "%userData%\config.ini"
echo uncap_fps = true >> "%userData%\config.ini"

echo.
echo Launching OpenRCT2 Engine in Headless Mode...
echo Loading Park: small_park_with_ferris_wheel.sv6
echo.
"%binDir%\openrct2-cli.exe" "%parkFile%" --user-data-path="%userData%" --headless

echo.
echo ===================================================
pause