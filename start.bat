@echo off
chcp 866 >nul
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python не найден.
  echo.
  echo   Установите Python 3.10 или новее: https://www.python.org/downloads/
  echo   При установке отметьте галочку "Add python.exe to PATH".
  echo.
  pause
  exit /b 1
)

REM Минимизированное окно, а не скрытый запуск: если что-то пойдёт не так
REM (нет интернета для установки зависимостей, занят порт), ошибку можно
REM прочитать, развернув окно. При обычном запуске оно просто висит в панели
REM задач и не мешает.
start "PFN" /min cmd /c python "%~dp0launcher.py" %*
exit /b 0
