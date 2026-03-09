@echo off
cd /d D:\contest_jingsai\jiaoke\platform_project\front-end
echo frontend script entered > ..\output\frontend.diag.log
call node_modules\.bin\vite.cmd --host 127.0.0.1 --port 5173 >> ..\output\frontend.diag.log 2>&1
echo frontend exit %errorlevel% >> ..\output\frontend.diag.log
