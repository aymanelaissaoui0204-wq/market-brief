@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Hole neue Briefings von GitHub ...
git pull
echo.
echo Baue die Datenbank market.db ...
where python >nul 2>nul
if %errorlevel%==0 (python scripts\build_db.py) else (py scripts\build_db.py)
if errorlevel 1 (
  echo.
  echo FEHLER: Die Datenbank wurde nicht gebaut. Schick den Text oben an Claude.
) else (
  echo.
  echo Fertig. Neue Tage liegen in obsidian-vault, die Datenbank in market.db.
)
pause
