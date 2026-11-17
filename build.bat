@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo          ABDMCX0X - Build Pipeline
echo =======================================================

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    if exist "%LOCALAPPDATA%\nvm\v24.21.0\node.exe" (
        set "PATH=%LOCALAPPDATA%\nvm\v24.21.0;%PATH%"
    ) else if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

echo [1/3] Configuring CMake Headless Core & Tests...
cmake -B build_headless -S . -DMCX_HEADLESS_ONLY=ON
if %ERRORLEVEL% neq 0 goto error_exit

echo [2/3] Building McxPhase0Tests...
cmake --build build_headless --config Release --target McxPhase0Tests
if %ERRORLEVEL% neq 0 goto error_exit

echo [3/3] Running McxPhase0Tests...
.\build_headless\Release\McxPhase0Tests.exe
if %ERRORLEVEL% neq 0 goto error_exit

if exist "wasm\CMakeLists.txt" (
    if defined RUN_WASM (
        pushd wasm
        call build_wasm.bat
        set WASM_ERR=!ERRORLEVEL!
        popd
        if !WASM_ERR! neq 0 goto error_exit
    )
)

echo =======================================================
echo  [OK] ABDMCX0X Build & Headless Tests Passed!
echo =======================================================
if "%1"=="nopause" exit /b 0
pause
exit /b 0

:error_exit
echo [ERROR] ABDMCX0X build pipeline failed.
if "%1"=="nopause" exit /b 1
pause
exit /b 1
