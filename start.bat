@echo off
cd /d "%~dp0"

if not exist .env (
    if exist env_setup.txt (
        copy env_setup.txt .env >nul
    )
)

where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo Python is not installed on this computer.
    echo Download it from: https://www.python.org/downloads/
    echo IMPORTANT: on the first install screen, check "Add python.exe to PATH".
    echo After installing, run start.bat again.
    echo.
    pause
    exit /b 1
)

if not exist venv (
    echo Setting up, this takes a couple of minutes, only needed once...
    python -m venv venv
)

call venv\Scripts\activate.bat

echo Installing required libraries...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
rem YouTube changes often; an old yt-dlp is the usual reason nothing plays
pip install --upgrade yt-dlp ytmusicapi >nul

if errorlevel 1 (
    echo.
    echo Could not install libraries. Check your internet connection and run start.bat again.
    pause
    exit /b 1
)

echo.
echo Starting Notka...
echo.
python run_notka.py

echo.
echo Notka stopped.
pause
