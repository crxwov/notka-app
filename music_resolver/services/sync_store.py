"""«Один аккаунт — все устройства»: любимое, плейлисты, настройки и
статистика слушателя хранятся не только на устройстве, но и здесь, под его
Telegram-аккаунтом. Телефон и компьютер видят одно и то же.

Что общее и как сходится:

* обычные ключи (любимое, плейлисты, настройки…) — у каждого ключа своя метка
  времени изменения; побеждает более свежая;
* статистика прослушиваний складывается: у каждого устройства свой отдельный
  счётчик, а общая цифра — их сумма, поэтому ничего не теряется и не
  удваивается.

Файл на пользователя: data/sync/<telegram id>.json. Кто спрашивает —
определяется подписанными данными Mini App (как в plus_store)."""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

DATA_DIR = Path(os.environ.get("NOTKA_DATA_DIR") or Path(__file__).resolve().parent.parent.parent / "data")
_DIR = DATA_DIR / "sync"
_LOCK = threading.Lock()

MAX_BYTES = 12 * 1024 * 1024  # one account's whole state (a thousand-track import is ~0.6 MB each)
MAX_DEVICES = 8

# only these keys are shared: the rest of a device's state is its own
SHARED_KEYS = {
    "favorites", "playlists", "settings", "followedArtists", "followedMeta",
    "playlistFlags", "accountName", "accountAvatar", "recent", "sharedImports", "onboardingSeenV2",
}


class TooBig(Exception):
    pass


def _path(user_id: int) -> Path:
    return _DIR / f"{int(user_id)}.json"


def _empty() -> dict:
    return {"rev": 0, "shared": {}, "ts": {}, "devices": {}}


def load(user_id: int) -> dict:
    try:
        data = json.loads(_path(user_id).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _empty()
    if not isinstance(data, dict):
        return _empty()
    for key, kind in (("shared", dict), ("ts", dict), ("devices", dict)):
        if not isinstance(data.get(key), kind):
            data[key] = kind()
    data["rev"] = int(data.get("rev") or 0)
    return data


def exchange(user_id: int, incoming: dict) -> dict:
    """Takes what a device has changed, merges it into the account's state
    and answers with the whole of it."""
    shared_in = incoming.get("shared") if isinstance(incoming.get("shared"), dict) else {}
    ts_in = incoming.get("ts") if isinstance(incoming.get("ts"), dict) else {}
    device = incoming.get("device") if isinstance(incoming.get("device"), dict) else None
    with _LOCK:
        cur = load(user_id)
        for key, value in shared_in.items():
            if key not in SHARED_KEYS:
                continue
            try:
                stamp = float(ts_in.get(key) or 0)
            except (TypeError, ValueError):
                continue
            if stamp > float(cur["ts"].get(key) or 0):
                cur["shared"][key] = value
                cur["ts"][key] = stamp
        if incoming.get("clear_listens"):
            cur["devices"] = {}
        if device and device.get("id") and isinstance(device.get("listens"), dict):
            cur["devices"][str(device["id"])[:40]] = {"listens": device["listens"], "at": int(time.time())}
            if len(cur["devices"]) > MAX_DEVICES:
                newest = sorted(cur["devices"].items(), key=lambda kv: kv[1].get("at", 0), reverse=True)[:MAX_DEVICES]
                cur["devices"] = dict(newest)
        cur["rev"] += 1
        blob = json.dumps(cur, ensure_ascii=False, separators=(",", ":"))
        if len(blob.encode("utf-8")) > MAX_BYTES:
            raise TooBig()
        _DIR.mkdir(parents=True, exist_ok=True)
        tmp = _path(user_id).with_suffix(".tmp")
        tmp.write_text(blob, encoding="utf-8")
        os.replace(tmp, _path(user_id))
        return cur
