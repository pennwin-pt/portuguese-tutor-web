@echo off
chcp 65001 >nul
echo 正在下载并整理第二期模型（room + park）...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_models_phase2.ps1"
echo.
echo 按任意键关闭窗口...
pause >nul
