@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo          ABDMCX0X - Unified Build Pipeline
echo =======================================================

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    if exist "%LOCALAPPDATA%\nvm\v24.21.0\node.exe" (
        set "PATH=%LOCALAPPDATA%\nvm\v24.21.0;%PATH%"
    ) else if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

REM [1/5] Generate parameter registries from CDD v2.0 contract
if exist "Scripts\registry_generator.js" (
    echo [1/5] Generating parameter registries from CDD v2.0 contract...
    node Scripts\registry_generator.js
    if !ERRORLEVEL! neq 0 goto error_exit
) else (
    echo [1/5] Skipping registry_generator.js ^(not found^).
)

REM [2/5] Configure & build C++20 Headless Core + All Test Suites
echo [2/5] Configuring ^& building C++20 Headless Core + Tests...
cmake -B build_headless -S . -DMCX_HEADLESS_ONLY=ON
if !ERRORLEVEL! neq 0 goto error_exit
cmake --build build_headless --config Release
if !ERRORLEVEL! neq 0 goto error_exit

REM [3/5] Run full CTest suite (Phases 0..5 + Scope Smoke)
echo [3/5] Running CTest suite...
ctest --test-dir build_headless -C Release --output-on-failure
if !ERRORLEVEL! neq 0 goto error_exit

REM [4/5] Optional full JUCE 9 Standalone + VST3 build (pass 'full' or set BUILD_JUCE=1)
if /I "%1"=="full" set BUILD_JUCE=1
if defined BUILD_JUCE (
    if exist "node_modules\.bin\vite.cmd" (
        echo [4a/5] Building offline WebUI bundle ^(WebUI\dist^)...
        call node_modules\.bin\vite.cmd build
        if !ERRORLEVEL! neq 0 goto error_exit
    )
    echo [4b/5] Configuring ^& building JUCE 9 Standalone + VST3...
    cmake -B build -S . -DMCX_HEADLESS_ONLY=OFF -DCMAKE_BUILD_TYPE=Release
    if !ERRORLEVEL! neq 0 goto error_exit
    cmake --build build --config Release --target ABDMCX0X_All
    if !ERRORLEVEL! neq 0 goto error_exit
) else (
    echo [4/5] JUCE VST3/Standalone skipped ^(run 'build.bat full' to compile plugin targets^).
)

REM [5/5] Compile WebAssembly DSP module and deploy to WebUI
if defined SKIP_WASM (
    echo [5/5] WASM skipped ^(SKIP_WASM=1^).
) else if exist "wasm\build_wasm.bat" (
    echo [5/5] Compiling WebAssembly ^(WASM^) and deploying to WebUI...
    pushd wasm
    call build_wasm.bat
    set WASM_ERR=!ERRORLEVEL!
    popd
    if !WASM_ERR! neq 0 goto error_exit
) else (
    echo [5/5] wasm\build_wasm.bat not found.
)

echo =======================================================
echo  [OK] ABDMCX0X Unified Build ^& WASM Deploy Succeeded!
echo =======================================================
if /I "%1"=="nopause" exit /b 0
if /I "%2"=="nopause" exit /b 0
pause
exit /b 0

:error_exit
echo [ERROR] ABDMCX0X build pipeline failed.
if /I "%1"=="nopause" exit /b 1
if /I "%2"=="nopause" exit /b 1
pause
exit /b 1
