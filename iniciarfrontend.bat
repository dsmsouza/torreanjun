@echo off
title ANJUN - Servidor Frontend - Porta 3000
color 0B
cls

echo ===========================================================================
echo         TORRE DE CONTROLE ANJUN - SERVIDOR FRONTEND - PORTA 3000
echo ===========================================================================
echo.

echo [1/3] Verificando porta 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Liberando porta 3000 ocupada pelo PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/3] Limpando trava de sessao anterior...
if exist "C:\ANJUN\frontend\.next\dev\lock" (
    del /f /q "C:\ANJUN\frontend\.next\dev\lock" >nul 2>&1
)

cd /d "C:\ANJUN\frontend"
set "NEXT_TELEMETRY_DISABLED=1"

echo [3/3] Iniciando Dashboard em http://localhost:3000 ...
echo O navegador abrira automaticamente em instantes!
echo.

start "" cmd /c "ping -n 5 127.0.0.1 >nul && start http://localhost:3000"

if exist "C:\ANJUN\node-portable\node.exe" (
    set "PATH=C:\ANJUN\node-portable;%PATH%"
    "C:\ANJUN\node-portable\node.exe" "C:\ANJUN\frontend\node_modules\next\dist\bin\next" dev -H 0.0.0.0 -p 3000
) else (
    call npm run dev
)

echo.
echo O servidor Frontend foi encerrado.
pause
