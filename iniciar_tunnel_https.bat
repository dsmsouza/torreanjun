@echo off
title ANJUN - Tunnel HTTPS Cloudflare
echo ========================================================
echo       INICIANDO TUNNEL HTTPS SEGURO (CLOUDFLARE)
echo ========================================================
echo.
echo Este script disponibiliza o sistema com HTTPS valido e cadeado verde.
echo Todas as maquinas da rede que acessarem por este link terao
echo acesso instantaneo ao Ctrl+V de imagem sem nenhuma restricao.
echo.
C:\ANJUN\cloudflared.exe tunnel --url http://localhost:3000
pause
