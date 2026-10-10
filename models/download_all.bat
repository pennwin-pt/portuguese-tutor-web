@echo off
chcp 65001 >nul
echo 正在导出全部 21 只怪物到 monsters_backup ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0export_all_monsters.ps1"
echo.
echo 按任意键关闭窗口...
pause >nul
