@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Hole neue Briefings von GitHub ...
git pull
echo.
echo Baue die Datenbank market.db ...
where python >nul 2>nul && (python scripts\build_db.py) || (py scripts\build_db.py)
echo.
echo Fertig. Neue Tage liegen in obsidian-vault, die Datenbank in market.db.
pause
