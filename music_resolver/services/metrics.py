"""What the owner sees on the admin site: who uses Нотка and how much.

Two small JSON files in ``data/``:

* ``users.json``   — a register of people (by Telegram id): when first seen, last
  seen, how many times they opened the app, which devices, their name and
  @username as Telegram gives it in the Mini App's signed data;
* ``metrics.json`` — anonymous counters per day (opens, searches, plays,
  imports, inline queries …).

Both are kept in memory and written to disk every few seconds.
"""

from __future__ import annotations

import atexit
import json
import os
import threading
import time
from pathlib import Path
from urllib.parse import parse_qsl

DATA_DIR = Path(os.environ.get("NOTKA_DATA_DIR") or Path(__file__).resolve().parent.parent.parent / "data")
_USERS = DATA_DIR / "users.json"
_COUNTERS = DATA_DIR / "metrics.json"
_LOCK = threading.Lock()
_SESSION_GAP = 30 * 60  # opening again within half an hour is the same visit
_TZ_OFFSET = 3 * 3600  # days are counted in Moscow time, as the owner lives
KEEP_DAYS = 120


def day_key(ts: float | None = None) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime((ts if ts is not None else time.time()) + _TZ_OFFSET))


def _read(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


_users: dict = _read(_USERS)
_counters: dict = _read(_COUNTERS)
_dirty = False


def _write(path: Path, data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


def flush() -> None:
    global _dirty
    with _LOCK:
        if not _dirty:
            return
        _dirty = False
        users, counters = json.loads(json.dumps(_users)), json.loads(json.dumps(_counters))
    try:
        _write(_USERS, users)
        _write(_COUNTERS, counters)
    except OSError:
        pass


def _flusher() -> None:
    while True:
        time.sleep(15)
        flush()


threading.Thread(target=_flusher, daemon=True).start()
atexit.register(flush)


# ---------------------------------------------------------------- counters
def count(name: str, n: int = 1) -> None:
    global _dirty
    today = day_key()
    with _LOCK:
        day = _counters.setdefault(today, {})
        day[name] = int(day.get(name, 0)) + n
        # old days go
        if len(_counters) > KEEP_DAYS + 20:
            for old in sorted(_counters)[: len(_counters) - KEEP_DAYS]:
                _counters.pop(old, None)
        _dirty = True


def counters() -> dict:
    with _LOCK:
        return json.loads(json.dumps(_counters))


# ------------------------------------------------------------------- people
def profile_from_init_data(init_data: str) -> dict:
    """The name fields of the (already verified) initData's user."""
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
        user = json.loads(pairs.get("user", "{}"))
    except (ValueError, TypeError):
        return {}
    name = " ".join(x for x in (user.get("first_name"), user.get("last_name")) if x).strip()
    return {
        "name": name[:80],
        "username": (user.get("username") or "")[:40],
        "lang": (user.get("language_code") or "")[:8],
        "premium": bool(user.get("is_premium")),
    }


def touch_user(user_id: int, profile: dict | None = None, device_id: str | None = None) -> None:
    """The person opened the app (or it asked for sync): a visit is noted."""
    global _dirty
    now = int(time.time())
    today = day_key(now)
    with _LOCK:
        u = _users.setdefault(str(user_id), {"first_seen": now, "opens": 0, "days": [], "devices": {}})
        new_visit = now - int(u.get("last_seen") or 0) > _SESSION_GAP
        if new_visit:
            u["opens"] = int(u.get("opens") or 0) + 1
        u["last_seen"] = now
        if today not in u["days"]:
            u["days"].append(today)
            u["days"] = u["days"][-KEEP_DAYS:]
        for key, value in (profile or {}).items():
            if value not in (None, ""):
                u[key] = value
        if device_id:
            u["devices"][str(device_id)[:40]] = now
            if len(u["devices"]) > 8:
                for old in sorted(u["devices"], key=u["devices"].get)[:-8]:
                    u["devices"].pop(old, None)
        _dirty = True
    if new_visit:
        count("opens")


def users() -> dict:
    with _LOCK:
        return json.loads(json.dumps(_users))
