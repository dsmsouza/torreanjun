@echo off
chcp 65001 > nul
title Torre ANJUN - Subir Planilha em Tempo Real (No Dia / Intraday)

echo ===============================================================================
echo            TORRE DE CONTROLE ANJUN - CARGA DO DIA EM TEMPO REAL
echo ===============================================================================
echo.

set PYTHON_EXEC=C:\ANJUN\backend\venv\Scripts\python.exe

if not exist "%PYTHON_EXEC%" (
    set PYTHON_EXEC=python
)

"%PYTHON_EXEC%" "C:\ANJUN\backend\scripts\subir_dia_atual.py" %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRO] Ocorreu uma falha durante o processamento da planilha.
    echo.
    pause
)
