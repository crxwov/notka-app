@echo off
cd /d "%~dp0"
echo ========================================================
echo   Сборка и установка мобильного приложения Нотка
echo ========================================================
powershell -ExecutionPolicy Bypass -File "%~dp0android\build.ps1" -Install
pause
