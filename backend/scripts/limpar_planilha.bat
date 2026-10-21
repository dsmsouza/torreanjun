@echo off
REM ============================================================
REM  limpar_planilha.bat - Reduz planilhas XLSX gigantes
REM
REM  Uso:
REM    limpar_planilha.bat "C:\caminho\planilha.xlsx"
REM    limpar_planilha.bat "C:\caminho\planilha.xlsx" "C:\caminho\saida.xlsx"
REM
REM  Mantém só as colunas usadas pelo backend, apenas estados BR
REM  (26+DF) e exclui o MD SP-R-TFK001.
REM ============================================================
setlocal

if "%~1"=="" (
  echo Uso: limpar_planilha.bat "C:\caminho\planilha.xlsx" [destino.xlsx]
  exit /b 1
)

set "PY=%~dp0..\venv\Scripts\python.exe"
if not exist "%PY%" (
  echo ERRO: python do venv nao encontrado em "%PY%"
  exit /b 1
)

"%PY%" "%~dp0limpar_planilha.py" %*
exit /b %ERRORLEVEL%