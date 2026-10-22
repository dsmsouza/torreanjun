@echo off
chcp 65001 > nul
title Torre ANJUN - Reconciliação Retroativa & Carga de Status

echo ===============================================================================
echo        TORRE DE CONTROLE ANJUN - RECONCILIAÇÃO RETROATIVA & STATUS DO MÊS
echo ===============================================================================
echo.

set PYTHON_EXEC=C:\ANJUN\backend\venv\Scripts\python.exe

if not exist "%PYTHON_EXEC%" (
    set PYTHON_EXEC=python
)

if not exist "%PYTHON_EXEC%" (
    set PYTHON_EXEC=C:\Python314\python.exe
)

"%PYTHON_EXEC%" "C:\ANJUN\backend\scripts\subir_status_reconciliacao.py" %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRO] Ocorreu uma falha durante o processamento da planilha de status.
    echo.
    pause
)
