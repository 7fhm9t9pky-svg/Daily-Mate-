@echo off
title Daily Mate - avvio
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
set "SERVER_DIR=%ROOT%server"
set "PORT=3000"
set "LOG=%ROOT%avvia-log.txt"
set "SLOG=%ROOT%server-log.txt"

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

> "%LOG%" echo Daily Mate - avvio del %DATE% %TIME%

rem ---------- 1. Pulizia: chiudo un eventuale server rimasto aperto da prima ----------
echo [1/4] Chiudo eventuali server rimasti aperti...
taskkill /FI "WINDOWTITLE eq Daily Mate Server*" /T /F >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do taskkill /PID %%p /F >nul 2>nul
timeout /t 2 /nobreak >nul

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

rem ---------- 2. Avvio del server e attesa che risponda ----------
set "TRY=0"
:startserver
set /a TRY+=1
echo [2/4] Avvio il server Daily Mate sulla porta %PORT%...
> "%SLOG%" echo Avvio %DATE% %TIME%
start "Daily Mate Server" /MIN /D "%SERVER_DIR%" cmd /c "npm start >> ..\server-log.txt 2>&1"

set "UP=0"
for /l %%i in (1,1,20) do (
    if "!UP!"=="0" (
        powershell -NoProfile -Command "try { Invoke-WebRequest http://localhost:%PORT%/ -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { if ($_.Exception.Response) { exit 0 } else { exit 1 } }" >nul 2>nul
        if not errorlevel 1 (set "UP=1") else timeout /t 2 /nobreak >nul
    )
)

if "!UP!"=="1" goto serverok

echo.
echo [PROBLEMA] Il server non risponde. Ultime righe del suo messaggio:
echo --------------------------------------------
powershell -NoProfile -Command "if (Test-Path '%SLOG%') { Get-Content '%SLOG%' -Tail 25 }"
echo --------------------------------------------
if "!TRY!"=="1" (
    echo.
    echo Provo a riparare: reinstallo le dipendenze del server e riavvio...
    taskkill /FI "WINDOWTITLE eq Daily Mate Server*" /T /F >nul 2>nul
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do taskkill /PID %%p /F >nul 2>nul
    pushd "%SERVER_DIR%"
    call npm install
    popd
    goto startserver
)
echo.
echo Il server non parte nemmeno dopo la riparazione.
echo Fai una foto o copia il testo qui sopra e mandalo a Claude.
echo Il file %SLOG% contiene lo stesso messaggio.
pause
exit /b 1

:serverok
echo      Server acceso: http://localhost:%PORT%  [OK]
echo.

rem ---------- 3. Tailscale ----------
echo [3/4] Controllo Tailscale...
tailscale status > "%ROOT%ts-status.txt" 2>&1
findstr /I /C:"Logged out" /C:"Stopped" /C:"NeedsLogin" /C:"not running" "%ROOT%ts-status.txt" >nul
if not errorlevel 1 (
    echo [PROBLEMA] Tailscale non e' collegato. Provo a collegarlo...
    tailscale up
)

echo [4/4] Attivo la condivisione online con Tailscale Funnel...
tailscale funnel reset >nul 2>nul
tailscale funnel --bg %PORT% > "%ROOT%funnel-out.txt" 2>&1
type "%ROOT%funnel-out.txt"
>> "%LOG%" type "%ROOT%funnel-out.txt"

tailscale funnel status > "%ROOT%funnel-status.txt" 2>&1
>> "%LOG%" type "%ROOT%funnel-status.txt"

findstr /C:"https://" "%ROOT%funnel-status.txt" >nul
if errorlevel 1 (
    echo.
    echo ============================================
    echo [PROBLEMA] Il link pubblico NON e' attivo.
    echo Il server sul PC funziona ^(http://localhost:%PORT%^), ma da fuori non si raggiunge.
    echo.
    type "%ROOT%funnel-out.txt"
    echo.
    echo Cosa fare:
    echo  - Se sopra compare un link che inizia con https://login.tailscale.com, aprilo
    echo    nel browser e conferma l'attivazione di Funnel, poi rilancia questo file.
    echo  - Apri Tailscale vicino all'orologio: deve dire Connected. Se no, accedi di nuovo.
    echo  - Se resta cosi, manda a Claude il testo qui sopra.
    echo ============================================
    pause
    exit /b 1
)

echo.
echo ============================================
echo Fatto! Indirizzo da mandare ai tuoi amici:
echo.
type "%ROOT%funnel-status.txt"
echo ============================================
echo.
echo Lascia questa finestra aperta (puoi ridurla a icona) finche' vuoi che
echo l'app resti raggiungibile. Il server gira nella finestra ridotta a icona
echo "Daily Mate Server": non chiuderla.
echo.
pause
