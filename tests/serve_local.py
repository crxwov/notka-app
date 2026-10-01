"""Backend + mini-app on http://127.0.0.1:8099 — no tunnel, no bot. For local checks only.

    venv\\Scripts\\python tests\\serve_local.py      (leave it running)
    node tests\\e2e.mjs                             (in another window)
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
os.environ.setdefault("YTDLP_COOKIES_FROM_BROWSER", "chrome")

import uvicorn
from fastapi.staticfiles import StaticFiles

from music_resolver.main import create_app

app = create_app()
app.mount("/app", StaticFiles(directory=str(ROOT / "miniapp"), html=True), name="miniapp")
uvicorn.run(app, host="127.0.0.1", port=8099, log_level="warning")
