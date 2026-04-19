@echo off
echo ===================================================
echo OpenRCT2 Custom Build Script (MSBuild Native)
echo Target: Kyla-PC (x64 Release)
echo ===================================================

echo Loading Visual Studio 2022 Build Tools...
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64

echo.
echo Navigating to OpenRCT2 Source Directory...
cd /d "C:\Users\hayfo\source\OpenRCT2\"

echo.
echo Restoring Dependencies and Compiling OpenRCT2 Engine...
msbuild openrct2.sln /p:Configuration=Release /p:Platform=x64 /t:Build /m

echo.
echo ===================================================
if %ERRORLEVEL% EQU 0 (
    echo Build completed successfully!
    echo Your compiled executable is located in C:\Users\hayfo\source\OpenRCT2\bin\
) else (
    echo Build failed. Check the error messages above.
)
echo ===================================================
pause
