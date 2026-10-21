@echo off
chcp 65001 >nul
title ANJUN - Servidor Frontend (Porta 3000)
color 0B
cls

echo ===========================================================================
echo         TORRE DE CONTROLE ANJUN - SERVIDOR FRONTEND (PORTA 3000)
echo ===========================================================================
echo.

REM Liberar a porta 3000 caso exista algum processo antigo travado
echo [1/3] Verificando porta 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Encerrando processo anterior na porta 3000 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

REM Remover lock antigo do Next.js se existir
echo [2/3] Limpando trava de sessao anterior...
if exist "%~dp0frontend\.next\dev\lock" (
    del /f /q "%~dp0frontend\.next\dev\lock" >nul 2>&1
)

cd /d "%~dp0frontend"
set "NEXT_TELEMETRY_DISABLED=1"

echo [3/3] Iniciando Dashboard em http://localhost:3000 ...
echo.

if exist "%~dp0node-portable\node.exe" (
    set "PATH=%~dp0node-portable;%PATH%"
    "%~dp0node-portable\node.exe" "%~dp0frontend\node_modules\next\dist\bin\next" dev -H 0.0.0.0 -p 3000
) else (
    call npm run dev -- -H 0.0.0.0 -p 3000
)

if errorlevel 1 (
    echo.
    echo [ERRO] O servidor Frontend encerrou com falha.
    pause
)
