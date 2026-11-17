@echo off
echo =======================================================
echo          ABDMCX0X - WebAssembly (WASM) Build
echo =======================================================

where emcmake >nul 2>&1
if not errorlevel 1 goto :EMSDK_OK

if exist "D:\desarrollos\emsdk\emsdk_env.bat" call "D:\desarrollos\emsdk\emsdk_env.bat"
if defined EMSDK if exist "%EMSDK%\emsdk_env.bat" call "%EMSDK%\emsdk_env.bat"
if exist "C:\emsdk\emsdk_env.bat" call "C:\emsdk\emsdk_env.bat"

where emcmake >nul 2>&1
if not errorlevel 1 goto :EMSDK_OK

echo [ERROR] Emscripten SDK (emcmake) not found.
exit /b 1

:EMSDK_OK
cd /d "%~dp0"
if not exist build_wasm mkdir build_wasm

call emcmake cmake -G Ninja -S . -B build_wasm -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 exit /b 1

cmake --build build_wasm --target mcx0x_dsp_core
if errorlevel 1 exit /b 1

echo =======================================================
echo  WASM Core compilation succeeded!
echo =======================================================
exit /b 0
