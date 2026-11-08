@echo off
chcp 866 >nul
cd /d "%~dp0"
python "%~dp0launcher.py" --stop
timeout /t 2 >nul
