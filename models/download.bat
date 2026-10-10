@echo off
chcp 65001 >nul
echo 正在下载并整理 shop 场景模型...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_models.ps1"
echo.
echo 按任意键关闭窗口...
pause >nul
