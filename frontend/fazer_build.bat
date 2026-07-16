@echo off
echo ========================================================
echo INICIANDO BUILD DO FRONTEND (ANJUN)
echo ========================================================
echo.
echo Configuracao: Desativando workers para evitar erros de memoria...
set NEXT_PRIVATE_WORKERS=1

echo Executando Next.js build...
C:\ANJUN\node-portable\node.exe node_modules\next\dist\bin\next build --webpack

echo.
echo Se nao houve erros graves acima, o build foi CONCLUIDO COM SUCESSO!
echo Voce ja pode rodar o iniciar_servidor.bat
echo.
pause
