@echo off
title ANJUN - Servidor Backend - Porta 8000
color 0A
cls

echo ===========================================================================
echo          TORRE DE CONTROLE ANJUN - SERVIDOR BACKEND - PORTA 8000
echo ===========================================================================
echo.

echo [1/2] Verificando porta 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Liberando porta 8000 ocupada pelo PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "C:\ANJUN\backend"

set "PYTHON_EXE=C:\ANJUN\backend\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=C:\Python314\python.exe"
)
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

echo [2/2] Iniciando API FastAPI em http://localhost:8000 ...
echo Mantenha esta janela aberta enquanto estiver usando o sistema.
echo.
"%PYTHON_EXE%" -m uvicorn main:app --host 0.0.0.0 --port 8000

echo.
echo O servidor Backend foi encerrado.
pause
