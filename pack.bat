@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "NAME=portuguese-tutor-web.zip"
set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

set "OUT=%TEMP%\%NAME%"
for %%I in ("%~dp0..\%NAME%") do set "DEST=%%~fI"

if exist "%OUT%" del /f /q "%OUT%"

set "SEVENZIP="
if exist "C:\Program Files\7-Zip\7z.exe" set "SEVENZIP=C:\Program Files\7-Zip\7z.exe"
if not defined SEVENZIP if exist "C:\Program Files (x86)\7-Zip\7z.exe" set "SEVENZIP=C:\Program Files (x86)\7-Zip\7z.exe"
if not defined SEVENZIP (
    where 7z >nul 2>&1
    if not errorlevel 1 set "SEVENZIP=7z"
)

if not defined SEVENZIP (
    echo [ERROR] 7-Zip executable 7z.exe not found.
    echo Please install 7-Zip or add it to system PATH.
    pause
    exit /b 1
)

echo ============================================================
echo  Packing project into:
echo    %DEST%
echo  Skipping: .git  .idea  sounds  images  *.skill  SKILL.md
echo ============================================================
echo.

"%SEVENZIP%" a -tzip -mx=5 "%OUT%" "*" "-xr!.git" "-xr!.idea" "-xr!sounds" "-xr!images" "-xr!*.skill" "-xr!SKILL.md"

if errorlevel 1 (
    echo.
    echo [ERROR] 7-Zip packing failed. No zip was saved.
    if exist "%OUT%" del /f /q "%OUT%"
    pause
    exit /b 1
)

move /y "%OUT%" "%DEST%" >nul
if errorlevel 1 (
    echo.
    echo [ERROR] Could not move the zip to the parent folder.
    echo The file is still at:
    echo   %OUT%
    pause
    exit /b 1
)

if exist "%~dp0%NAME%" del /f /q "%~dp0%NAME%"

echo.
echo Done.
echo   %DEST%
pause
exit /b 0
