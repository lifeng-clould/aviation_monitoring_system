from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import sys

ROOT = Path(r"D:\contest_jingsai\jiaoke\platform_project\front-end\dist").resolve()
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173

class SpaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        request_path = self.path.split("?", 1)[0]
        if request_path.startswith("/assets/") or request_path == "/vite.svg":
            return super().do_GET()
        target = (ROOT / request_path.lstrip("/")).resolve()
        if request_path == "/" or not str(target).startswith(str(ROOT)) or not target.exists() or target.is_dir():
            self.path = "/index.html"
        return super().do_GET()

if __name__ == "__main__":
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), SpaHandler)
    server.serve_forever()
