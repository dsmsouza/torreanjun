@echo off
chcp 65001 >nul
title ANJUN - Servidor Backend (Porta 8000)
color 0A
cls

echo ===========================================================================
echo          TORRE DE CONTROLE ANJUN - SERVIDOR BACKEND (PORTA 8000)
echo ===========================================================================
echo.

REM Liberar a porta 8000 caso exista algum processo antigo travado
echo [1/2] Verificando porta 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo Encerrando processo anterior na porta 8000 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%~dp0backend"

set "PYTHON_EXE=%~dp0backend\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

echo [2/2] Iniciando API FastAPI em http://localhost:8000 ...
echo.
"%PYTHON_EXE%" -m uvicorn main:app --host 0.0.0.0 --port 8000

if errorlevel 1 (
    echo.
    echo [ERRO] O servidor Backend encerrou com falha.
    pause
)
