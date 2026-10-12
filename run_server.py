"""
Запускает Нотку на постоянном сервере (не на домашнем компьютере):
  1. Бэкенд music_resolver + мини-апп как статика — на 127.0.0.1:PORT.
     Наружу его отдаёт Caddy (https и сертификат — его забота).
  2. Telegram-бот, которому сообщается постоянный адрес мини-аппа.

В отличие от run_notka.py здесь нет туннеля: адрес берётся из PUBLIC_URL
в .env (например, https://notka.example) и не меняется от запуска к запуску.

На сервере этот файл запускает systemd (см. deploy/setup.sh), руками — не нужно.
"""
import json
import os
import re
import subprocess
import sys
import tarfile
import threading
import time
import uuid
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
        # the app runs as the unprivileged user "notka"; a sudoers rule allows exactly this command
        subprocess.run(["sudo", "-n", "systemctl", "restart", "warp-proxy"], timeout=30, check=False)
    except Exception as exc:
        print(f"[watchdog] could not restart warp-proxy: {exc!r}", flush=True)


def watch_health() -> None:
    """Every few minutes runs a real search through the app's own address.
    Three failures in a row: tells the owner; when it works again: tells that too."""
    time.sleep(90)  # let the app and the bot finish starting
    failures = 0
    reported_down = False
    play_failures = 0
    play_reported = False
    # a different artist each time, so a cached answer can't hide a dead search
    artists = ["queen", "coldplay", "adele", "drake", "eminem", "muse", "abba", "nirvana"]
    turn = 0
    while True:
        turn += 1
        first_id = None
        try:
            query = urllib.parse.urlencode({"q": artists[turn % len(artists)]})
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/search?{query}", timeout=30) as resp:
                ok = resp.status == 200
                results = json.loads(resp.read().decode("utf-8", "replace")).get("results") or []
                first_id = next((r["sourceId"] for r in results if r.get("source") == "youtube_music"), None)
        except Exception:
            ok = False
        # every fourth round: can a track really be fetched? (search alone does not show YouTube refusing downloads)
        if ok and first_id and turn % 4 == 0:
            try:
                q = urllib.parse.urlencode({"source": "youtube_music", "id": first_id})
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/prepare?{q}", timeout=90) as resp:
                    played = resp.status == 200
            except Exception:
                played = False
            if played:
                if play_reported:
                    tell_owner("Нотка: треки снова скачиваются.")
                play_failures, play_reported = 0, False
            else:
                play_failures += 1
                if play_failures >= 3 and not play_reported:
                    play_reported = True
                    tell_owner(
                        "Нотка: поиск работает, но треки не скачиваются три проверки подряд. "
                        "Чаще всего YouTube просит войти («not a bot»): нужны куки аккаунта или другой выход в сеть."
                    )
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


def make_backup(data_dir: Path, backup_dir: Path, keep: int = 7) -> Path:
    """A dated .tar.gz of the data folder (people's accounts, Plus, events, stats), the newest `keep` kept."""
    backup_dir.mkdir(parents=True, exist_ok=True)
    out = backup_dir / f"notka-data-{time.strftime('%Y-%m-%d')}.tar.gz"
    tmp = out.with_name(out.name + f".{uuid.uuid4().hex[:6]}.part")
    with tarfile.open(tmp, "w:gz") as tar:
        tar.add(str(data_dir), arcname="data", filter=lambda ti: None if ti.name.endswith(".tmp") else ti)
    tmp.replace(out)
    for old in sorted(backup_dir.glob("notka-data-*.tar.gz"))[:-keep]:
        old.unlink(missing_ok=True)
    return out


def send_file_to_owner(path: Path, caption: str) -> bool:
    if not BOT_TOKEN or not ADMIN_IDS or path.stat().st_size > 45 * 1024 * 1024:
        return False
    ok = False
    for chat_id in ADMIN_IDS:
        boundary = uuid.uuid4().hex
        parts = []
        for name, value in (("chat_id", str(chat_id)), ("caption", caption)):
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="document"; filename="{path.name}"\r\nContent-Type: application/gzip\r\n\r\n'.encode())
        body = b"".join(parts) + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument", data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        try:
            urllib.request.urlopen(req, timeout=120).read()
            ok = True
        except Exception as exc:
            print(f"[backup] could not send to {chat_id}: {exc!r}", flush=True)
    return ok


def watch_backup() -> None:
    """Once a day: a copy of the data to the backups folder, and to the owner in Telegram."""
    from music_resolver.services.plus_store import DATA_DIR

    time.sleep(600)
    while True:
        try:
            path = make_backup(DATA_DIR, DATA_DIR.parent / "backups")
            size = path.stat().st_size
            sent = send_file_to_owner(path, f"Копия данных Нотки {time.strftime('%Y-%m-%d')} ({size // 1024} КБ)")
            if not sent and size > 45 * 1024 * 1024:
                tell_owner(f"Нотка: копия данных {size // (1024 * 1024)} МБ, для Telegram великовата; лежит на сервере в backups/.")
        except Exception as exc:
            tell_owner(f"Нотка: не удалось сделать копию данных: {exc!r}")
        time.sleep(24 * 3600)


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
    threading.Thread(target=watch_backup, daemon=True).start()
    if RUN_BOT:
        threading.Thread(target=keep_bot_running, daemon=True).start()
    print(f"Notka is up on 127.0.0.1:{PORT}" + (f", public address {PUBLIC_URL}" if PUBLIC_URL else ""), flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
