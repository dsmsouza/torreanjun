@echo off
title Torre de Controle ANJUN
echo ==============================================
echo Iniciando a Torre de Controle ANJUN...
echo ==============================================

echo.
echo [1/2] Verificando Backend...
start "Backend ANJUN" cmd /k "cd C:\ANJUN\backend && call venv\Scripts\activate.bat && echo Instalando dependencias (se necessario)... && pip install -r requirements.txt && echo Subindo Servidor... && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo.
echo [2/2] Verificando Frontend...
where npm >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] O NPM (Node.js) não foi encontrado no sistema.
    echo Por favor, instale o Node.js em: https://nodejs.org/
    echo Se você já instalou, tente reiniciar o computador.
) ELSE (
    start "Frontend ANJUN" cmd /k "cd C:\ANJUN\frontend && echo Instalando dependencias... && npm install && echo Subindo Interface... && npm run dev"
    echo.
    echo Tudo certo! 
    echo O Backend vai rodar na porta 8000.
    echo O Frontend vai rodar na porta 3000.
    echo.
    echo Acesse no navegador: http://localhost:3000
)
echo ==============================================
pause
