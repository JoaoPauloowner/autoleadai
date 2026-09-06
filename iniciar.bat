@echo off
title AutoLead AI - Plataforma de Vendas Automotivas
chcp 65001 > nul
cls
echo ========================================================
echo   🚗 AUTOLEAD AI — PLATAFORMA DE VENDAS AUTOMOTIVAS 🚗
echo ========================================================
echo.
cd /d "%~dp0"

:: Se a pasta node_modules nao existir, instala automaticamente
if not exist node_modules (
  echo [1/3] Detectada primeira execucao. Instalando pacotes...
  call npm install
  echo [OK] Dependencias instaladas com sucesso!
  echo.
)

echo [2/3] Abrindo o painel no seu navegador...
timeout /t 2 > nul
start http://localhost:3000

echo [3/3] Iniciando o servidor...
echo.
echo Pressione Ctrl + C para encerrar o sistema quando terminar.
echo ========================================================
echo.
call npm start
pause
