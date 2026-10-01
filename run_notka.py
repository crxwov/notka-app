"""
Запускает Нотку целиком на этом компьютере:
  1. Поднимает бэкенд music_resolver (поиск/плеер) + отдаёт мини-апп как статику.
  2. Пробрасывает наружу через бесплатный туннель Cloudflare (https-ссылка).
  3. Запускает Telegram-бота с этой ссылкой.

Обычно этот файл руками не запускают — для этого есть start.bat (Windows).
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

# A track title the console can't display (emoji, rare letters) must not
# turn a log line into a failed request.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
if not BOT_TOKEN:
    print("Не найден BOT_TOKEN.")
    print("Открой файл .env в этой папке и впиши токен, который прислал @BotFather.")
    input("Нажми Enter, чтобы закрыть...")
    sys.exit(1)

PORT = int(os.environ.get("PORT", "8080"))

# Некоторые треки на YouTube помечены как 18+ и без входа в аккаунт вообще
# не отдаются (ошибка "Sign in to confirm your age"). Чтобы это работало,
# бэкенд читает куки прямо из установленного браузера на этом компьютере —
# нужно, чтобы в нём был выполнен вход в любой Google-аккаунт.
# Можно переопределить, задав в .env: YTDLP_COOKIES_FROM_BROWSER=edge
os.environ.setdefault("YTDLP_COOKIES_FROM_BROWSER", "chrome")


def run_backend() -> None:
    import uvicorn
    from fastapi.staticfiles import StaticFiles

    from music_resolver.main import create_app

    app = create_app()
    app.mount("/app", StaticFiles(directory=str(ROOT / "miniapp"), html=True), name="miniapp")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


def open_tunnel(port: int, wait_seconds: int = 90) -> str:
    """Start cloudflared and return the public https address it was given.

    pycloudflared's own helper gives up after a fixed number of log lines,
    and newer cloudflared versions print more than that before the address
    appears — so here the log is simply read until the address shows up
    (or the time runs out), however many lines come first.
    """
    import atexit
    import re

    from pycloudflared.util import get_info

    attempts = 20  # the request to Cloudflare is sometimes cut off by the network; it usually goes through on a retry
    for attempt in range(attempts):
        proc = subprocess.Popen(
            [get_info().executable, "tunnel", "--url", f"http://127.0.0.1:{port}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            encoding="utf-8",
            errors="replace",
        )
        atexit.register(proc.terminate)
        found: list[str] = []

        def read_log(process=proc, out=found) -> None:
            # keeps reading after the address is found too: a full pipe would freeze cloudflared
            for line in process.stderr:
                # the tunnel's own address is several words joined by hyphens;
                # api.trycloudflare.com, which the log also mentions, is not it
                match = re.search(r"https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com", line)
                if match and not out:
                    out.append(match.group(0))

        threading.Thread(target=read_log, daemon=True).start()
        deadline = time.time() + wait_seconds
        while time.time() < deadline and not found and proc.poll() is None:
            time.sleep(0.3)
        if found:
            return found[0]
        proc.terminate()
        if attempt + 1 < attempts:
            print(f"Cloudflare не ответил (попытка {attempt + 1} из {attempts}), пробую ещё раз...")
            time.sleep(2)

    print("Не получилось открыть публичную ссылку через Cloudflare.")
    print("Проверь интернет и запусти start.bat ещё раз.")
    input("Нажми Enter, чтобы закрыть...")
    sys.exit(1)


def main() -> None:
    print("Запускаю бэкенд (поиск и плеер)...")
    backend_thread = threading.Thread(target=run_backend, daemon=True)
    backend_thread.start()
    time.sleep(2)
    print(f"Бэкенд работает: http://127.0.0.1:{PORT}")

    print("Открываю публичную ссылку (через Cloudflare, это займёт 5-15 секунд)...")
    tunnel_url = open_tunnel(PORT)
    miniapp_url = f"{tunnel_url}/app/"
    print(f"Публичная ссылка бэкенда: {tunnel_url}")
    print(f"Ссылка на мини-апп:       {miniapp_url}")

    env = os.environ.copy()
    env["BOT_TOKEN"] = BOT_TOKEN
    env["MINIAPP_URL"] = miniapp_url

    print()
    print("Запускаю Telegram-бота...")
    print("Готово! Открой своего бота в Телеграме и нажми /start.")
    print("Чтобы всё остановить — просто закрой это окно.")
    print()

    bot_proc = subprocess.Popen([sys.executable, "-m", "bot.main"], cwd=str(ROOT), env=env)
    try:
        bot_proc.wait()
    except KeyboardInterrupt:
        bot_proc.terminate()


if __name__ == "__main__":
    main()
