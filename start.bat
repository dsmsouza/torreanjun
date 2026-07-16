@echo off
title Inicializador - Torre de Controle ANJUN
echo =====================================================================
echo    INICIALIZADOR DA TORRE DE CONTROLE ANJUN - MODO DE PRODUCAO
echo =====================================================================
echo.

echo [1/3] Iniciando Servidor Backend (FastAPI)...
start "ANJUN Backend API" cmd /k "cd /d C:\ANJUN\backend && C:\ANJUN\backend\venv\Scripts\python.exe -m uvicorn main:app --port 8000"

echo [2/3] Iniciando Servidor Frontend (Next.js Producao)...
start "ANJUN Frontend App" cmd /k "cd /d C:\ANJUN\frontend && set PATH=C:\ANJUN\node-portable;%%PATH%% && C:\ANJUN\node-portable\node.exe C:\ANJUN\frontend\node_modules\next\dist\bin\next start"

echo.
echo Aguardando 5 segundos para inicializacao dos servidores...
timeout /t 5 /nobreak > nul

echo [3/3] Abrindo Torre de Controle no navegador...
start http://localhost:3000?master=diego2026

echo.
echo =====================================================================
echo       Inicializacao concluida! Mantenha as janelas abertas.
echo =====================================================================
echo.
pause
