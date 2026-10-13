@echo off
title Daily Mate - avvio
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
set "SERVER_DIR=%ROOT%server"
set "PORT=3000"

echo ============================================
echo   Daily Mate - avvio server + condivisione
echo ============================================
echo.

rem Node.js portatile: se non e' installato, lo cerco in alcune cartelle comuni
if exist "%USERPROFILE%\Desktop\nodejs\node.exe" set "PATH=%USERPROFILE%\Desktop\nodejs;%PATH%"
if exist "%USERPROFILE%\OneDrive\Desktop\nodejs\node.exe" set "PATH=%USERPROFILE%\OneDrive\Desktop\nodejs;%PATH%"
if exist "%ROOT%..\nodejs\node.exe" set "PATH=%ROOT%..\nodejs;%PATH%"
if exist "%ROOT%nodejs\node.exe" set "PATH=%ROOT%nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERRORE] Node.js non trovato.
    echo Installalo da https://nodejs.org - scegli la versione LTS - poi rilancia questo file.
    pause
    exit /b 1
)

where tailscale >nul 2>nul
if errorlevel 1 (
    echo [ERRORE] Tailscale non trovato.
    echo Installalo da https://tailscale.com/download, fai il login, poi rilancia questo file.
    pause
    exit /b 1
)

if not exist "%SERVER_DIR%\node_modules" (
    echo Prima installazione: scarico le dipendenze del server...
    pushd "%SERVER_DIR%"
    call npm install
    popd
    echo.
)

if not exist "%SERVER_DIR%\.env" (
    echo Nessun file .env trovato: ne creo uno nuovo con una chiave segreta casuale...
    for /f "delims=" %%i in ('node "%SERVER_DIR%\scripts\gen-secret.cjs"') do set "SECRET=%%i"
    > "%SERVER_DIR%\.env" (
        echo PORT=%PORT%
        echo JWT_SECRET=!SECRET!
        echo DATA_DIR=./data
    )
    echo Fatto: server\.env creato.
    echo.
)

echo Avvio il server Daily Mate sulla porta %PORT%...
start "Daily Mate Server" /D "%SERVER_DIR%" cmd /k "npm start"

echo Attendo che il server sia pronto...
timeout /t 3 /nobreak >nul

echo Attivo la condivisione online con Tailscale Funnel...
tailscale funnel --bg %PORT% >nul

echo.
echo ============================================
echo Fatto! Indirizzo da mandare ai tuoi amici:
echo.
tailscale funnel status
echo ============================================
echo.
echo Lascia questa finestra e quella del server aperte - si possono ridurre
echo a icona, basta non chiuderle - finche' vuoi che l'app resti
echo raggiungibile dai tuoi amici.
echo.
pause
