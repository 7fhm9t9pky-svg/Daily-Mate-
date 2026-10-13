@echo off
title Daily Mate - stop
echo Interrompo la condivisione online - Tailscale Funnel...
tailscale funnel reset >nul 2>nul

echo Chiudo il server Daily Mate...
taskkill /FI "WINDOWTITLE eq Daily Mate Server*" /T /F >nul 2>nul

echo.
echo Fatto. L'app non e' piu' raggiungibile dall'esterno.
pause
