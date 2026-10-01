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


def main() -> None:
    print("Запускаю бэкенд (поиск и плеер)...")
    backend_thread = threading.Thread(target=run_backend, daemon=True)
    backend_thread.start()
    time.sleep(2)
    print(f"Бэкенд работает: http://127.0.0.1:{PORT}")

    print("Открываю публичную ссылку (через Cloudflare, это займёт 5-15 секунд)...")
    from pycloudflared import try_cloudflare

    result = try_cloudflare(port=PORT)
    tunnel_url = str(result.tunnel).rstrip("/")
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
