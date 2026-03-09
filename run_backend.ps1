Set-Location 'D:\contest_jingsai\jiaoke\platform_project'
& 'D:\contest_jingsai\jiaoke\platform_project\venv\Scripts\python.exe' -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 *>> 'D:\contest_jingsai\jiaoke\platform_project\backend_run.log'
