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
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
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


ADMIN_IDS = [int(x) for x in re.findall(r"\d+", os.environ.get("ADMIN_IDS", ""))]


def tell_owner(text: str) -> None:
    """A short message from the bot to the owner; failures are only printed."""
    if not BOT_TOKEN or not ADMIN_IDS:
        print(f"[watchdog] {text}", flush=True)
        return
    for chat_id in ADMIN_IDS:
        try:
            data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
            urllib.request.urlopen(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", data=data, timeout=15).read()
        except Exception as exc:
            print(f"[watchdog] could not message {chat_id}: {exc!r}", flush=True)


def restart_warp() -> None:
    """The free WARP proxy sometimes loses its link to Cloudflare; restarting it usually helps."""
    try:
        subprocess.run(["systemctl", "restart", "warp-proxy"], timeout=30, check=False)
    except Exception as exc:
        print(f"[watchdog] could not restart warp-proxy: {exc!r}", flush=True)


def watch_health() -> None:
    """Every few minutes runs a real search through the app's own address.
    Three failures in a row: tells the owner; when it works again: tells that too."""
    time.sleep(90)  # let the app and the bot finish starting
    failures = 0
    reported_down = False
    # a different artist each time, so a cached answer can't hide a dead search
    artists = ["queen", "coldplay", "adele", "drake", "eminem", "muse", "abba", "nirvana"]
    turn = 0
    while True:
        turn += 1
        try:
            query = urllib.parse.urlencode({"q": artists[turn % len(artists)]})
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/search?{query}", timeout=30) as resp:
                ok = resp.status == 200
        except Exception:
            ok = False
        if ok:
            if reported_down:
                tell_owner("Нотка: поиск снова работает.")
            failures, reported_down = 0, False
        else:
            failures += 1
            if failures == 2:
                restart_warp()  # no effect when there is no WARP on this machine
            if failures >= 3 and not reported_down:
                reported_down = True
                tell_owner(
                    "Нотка: поиск не отвечает уже несколько минут. "
                    "Перезапустил прокси; если не оживёт сам, нужно смотреть логи: journalctl -u notka"
                )
        time.sleep(150)


def main() -> None:
    import uvicorn

    from music_resolver.main import create_app, mount_miniapp
    from music_resolver.services.proxy_guard import proxy_guard

    app = create_app()
    mount_miniapp(app, ROOT / "miniapp")

    last_restart = [0.0]

    def on_proxy_change(address: str, alive: bool) -> None:
        if alive:
            tell_owner("Нотка: прокси снова отвечает, вернулась на него.")
            return
        tell_owner("Нотка: прокси перестал отвечать, сервер работает напрямую (поиск идёт, но YouTube иногда отвечает ошибкой).")
        if time.time() - last_restart[0] > 600:  # not more often than every 10 minutes
            last_restart[0] = time.time()
            restart_warp()

    proxy_guard.listeners.append(on_proxy_change)
    threading.Thread(target=watch_health, daemon=True).start()
    if RUN_BOT:
        threading.Thread(target=keep_bot_running, daemon=True).start()
    print(f"Notka is up on 127.0.0.1:{PORT}" + (f", public address {PUBLIC_URL}" if PUBLIC_URL else ""), flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
