@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 goto use_py
where python >nul 2>nul
if %errorlevel%==0 goto use_python

echo Python is not installed or is not available in PATH.
echo Install Python 3, then double-click this file again.
pause
exit /b 1

:use_py
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8000/"
py -m http.server 8000 --bind 127.0.0.1
goto finished

:use_python
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8000/"
python -m http.server 8000 --bind 127.0.0.1

:finished
echo.
echo Server stopped. You can close this window.
pause
