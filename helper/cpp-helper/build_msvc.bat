@echo off
REM Build script for RemoteBT Helper using MSVC
REM Run this from Visual Studio Developer Command Prompt

echo Building RemoteBT Helper Agent with MSVC...

REM Create build directory
if not exist build mkdir build

REM Build with MSVC
cl /EHsc /std:c++17 /MD /O2 src\main.cpp ^
   /Fe:build\remotebt_helper.exe ^
   gdiplus.lib ws2_32.lib gdi32.lib ole32.lib uuid.lib user32.lib ^
   /link /SUBSYSTEM:CONSOLE

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [32mBuild successful![0m
    echo Executable: build\remotebt_helper.exe
    
    REM Copy to web downloads folder
    if exist "..\..\frontend\web\public\downloads" (
        copy /Y build\remotebt_helper.exe ..\..\frontend\web\public\downloads\remotebt_helper.exe
        echo [32mCopied to web downloads folder[0m
    )
    
    REM Clean up intermediate files
    del main.obj 2>nul
) else (
    echo.
    echo [31mBuild failed![0m
    exit /b 1
)
