@echo off
chcp 65001 >nul
title Torre ANJUN - Publicar Dados Online (Nuvem / Vercel)
color 0E
cls

echo ===========================================================================
echo       TORRE DE CONTROLE ANJUN - SINCRONIZACAO DO DASHBOARD ONLINE
echo ===========================================================================
echo.

set "PYTHON_EXEC=%~dp0backend\venv\Scripts\python.exe"
if not exist "%PYTHON_EXEC%" (
    set "PYTHON_EXEC=python"
)

"%PYTHON_EXEC%" "%~dp0backend\scripts\exportar_snapshot_online.py" --push

echo.
pause
