@echo off
setlocal EnableDelayedExpansion
REM ============================================================
REM start.bat -- Servidor de desarrollo local para ABDMCX0X WebUI
REM (Structured Groove-Rompler & Hardware Controller -- Web Edition)
REM Uso: start.bat           (abre navegador por defecto)
REM      start.bat nobrowser (solo levanta Vite en http://localhost:5330)
REM ============================================================

set "PORT=5330"
set "URL=http://localhost:%PORT%"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    if exist "%LOCALAPPDATA%\nvm\v24.21.0\node.exe" (
        set "PATH=%LOCALAPPDATA%\nvm\v24.21.0;%PATH%"
    ) else if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

echo ============================================================
echo   ABDMCX0X -- Groove-Rompler ^& Hardware Bridge ^(Web Edition^)
echo   Puerto: %PORT%
echo ============================================================

REM 1. Liberar puerto local %PORT% si estaba ocupado
echo [1/3] Verificando y liberando puerto %PORT%...
set "KILLED_ANY=0"
for /f "tokens=2,5" %%a in ('netstat -aon ^| findstr ":%PORT% "') do (
    echo %%a | findstr /R ":%PORT%$" >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        if not "%%b"=="0" (
            echo [INFO] Terminando proceso previo en puerto %PORT% [PID %%b]...
            taskkill /F /T /PID %%b >nul 2>&1
            set "KILLED_ANY=1"
        )
    )
)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 4 } | ForEach-Object { taskkill /F /T /PID $_ }" >nul 2>&1
if "%KILLED_ANY%"=="1" timeout /t 1 /nobreak >nul

if not exist "WebUI\public\wasm\mcx0x_dsp.wasm" (
    echo [AVISO] No se encontro WebUI\public\wasm\mcx0x_dsp.wasm.
    echo         Ejecuta 'build.bat' o 'wasm\build_wasm.bat' para audio WASM real.
)

REM 2. Abrir navegador (omitir con 'start.bat nobrowser')
if /I "%1"=="nobrowser" (
    echo [2/3] Modo nobrowser: omitiendo apertura de navegador.
) else (
    echo [2/3] Abriendo navegador en %URL%...
    start "" "%URL%"
)

REM 3. Iniciar Vite Dev Server
echo [3/3] Iniciando Vite Dev Server...
echo ============================================================
echo   URL: %URL%
echo   Directorio WebUI: WebUI\index.html
echo   Pulsa Ctrl+C para detener el servidor
echo ============================================================

if not exist "node_modules\.bin\vite.cmd" (
    echo [AVISO] Dependencias workspace no enlazadas todavia en ABDMCX0X.
    echo         Ejecuta una sola vez desde la raiz del monorepo:
    echo           cd D:\desarrollos\ABDSynths ^&^& pnpm install
    pause
    exit /b 1
)

call "node_modules\.bin\vite.cmd" --port %PORT% --strictPort
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] El servidor Vite se ha detenido o no se pudo iniciar.
    pause
)
