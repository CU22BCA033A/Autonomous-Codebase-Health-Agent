@echo off
cd /d "%~dp0"
echo Installing the mess booking bot (one time only)...
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [!] Python not found. Install it from https://www.python.org/downloads/
  echo     and TICK "Add python.exe to PATH" during install. Then run this again.
  pause
  exit /b 1
)
python -m playwright install chromium
echo.
echo Done! Now double-click START.bat
pause
