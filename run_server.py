"""
Запускает Нотку на постоянном сервере (не на домашнем компьютере):
  1. Бэкенд music_resolver + мини-апп как статика — на 127.0.0.1:PORT.
     Наружу его отдаёт Caddy (https и сертификат — его забота).
  2. Telegram-бот, которому сообщается постоянный адрес мини-аппа.

В отличие от run_notka.py здесь нет туннеля: адрес берётся из PUBLIC_URL
в .env (например, https://notka.example) и не меняется от запуска к запуску.

На сервере этот файл запускает systemd (см. deploy/setup.sh), руками — не нужно.
"""
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
PUBLIC_URL = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
PORT = int(os.environ.get("PORT", "8080"))
# RUN_BOT=0 — только бэкенд (для проверки без того, чтобы трогать настоящего бота)
RUN_BOT = os.environ.get("RUN_BOT", "1").strip() != "0"

if RUN_BOT and not BOT_TOKEN:
    sys.exit("BOT_TOKEN is not set in .env")
if RUN_BOT and not PUBLIC_URL.startswith("https://"):
    sys.exit("PUBLIC_URL is not set in .env (it must be the https:// address of this server)")


def keep_bot_running() -> None:
    """The bot is a separate process; if it falls, it is started again."""
    env = os.environ.copy()
    env["MINIAPP_URL"] = f"{PUBLIC_URL}/app/"
    while True:
        started = time.time()
        proc = subprocess.Popen([sys.executable, "-m", "bot.main"], cwd=str(ROOT), env=env)
        proc.wait()
        print(f"Bot stopped with code {proc.returncode}; starting it again", flush=True)
        # a bot that dies at once (a wrong token, say) must not spin the CPU
        time.sleep(5 if time.time() - started > 60 else 30)


def main() -> None:
    import uvicorn
    from fastapi.staticfiles import StaticFiles

    from music_resolver.main import create_app

    app = create_app()
    app.mount("/app", StaticFiles(directory=str(ROOT / "miniapp"), html=True), name="miniapp")
    if RUN_BOT:
        threading.Thread(target=keep_bot_running, daemon=True).start()
    print(f"Notka is up on 127.0.0.1:{PORT}" + (f", public address {PUBLIC_URL}" if PUBLIC_URL else ""), flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
