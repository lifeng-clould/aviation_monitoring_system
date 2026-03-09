@echo off
cd /d D:\contest_jingsai\jiaoke\platform_project
echo backend script entered > output\backend.diag.log
D:\contest_jingsai\jiaoke\platform_project\venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 >> output\backend.diag.log 2>&1
echo backend exit %errorlevel% >> output\backend.diag.log
