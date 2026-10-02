"""«События»: seasonal tasks and the rewards they open.

An event (Хэллоуин, Новый год…) has tasks, and every finished task is a
point. Points open rewards by steps (tiers). A reward is a cosmetic thing:
a frame, a theme, a numbered edition. Nothing here is for sale.

What the Mini App does is count the tasks (it sees the listening) and tell
the server how far each one has got. The server is the one that keeps who
has what, so a reward follows a person to another phone, and that numbers
a limited edition («№ 37 из 100»): the first ones to reach the last step
get it, and nobody else.

Kept in ``data/events.json``. A listener is known by their Telegram user id
from the Mini App's signed ``initData`` (see ``plus_store.verify_init_data``).
"""

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(os.environ.get("NOTKA_EVENTS_DIR") or os.environ.get("NOTKA_DATA_DIR") or Path(__file__).resolve().parent.parent.parent / "data")
_FILE = DATA_DIR / "events.json"
_lock = threading.Lock()
DAY = 86400

# ``kind`` says what in the app counts toward a task; ``unique`` tasks count
# different values (different moods, different days) instead of repeats.
EVENTS = {
    "halloween": {
        "title": "Хэллоуин",
        "atmo": "halloween",
        "start": "2026-10-16",
        "end": "2026-11-02",  # the day after the last one
        "tasks": [
            {"id": "listen", "kind": "listen", "title": "Послушай 15 минут музыки", "target": 15, "unit": "мин"},
            {"id": "bats", "kind": "bat", "title": "Поймай 3 летучие мыши", "target": 3},
            {"id": "mood", "kind": "mood", "title": "Включи микс под настроение", "target": 1, "unique": True},
            {"id": "share", "kind": "share", "title": "Поделись плейлистом с другом", "target": 1},
        ],
        "tiers": [
            {"points": 2, "item": "frame_pumpkin", "title": "Рамка «Тыква»", "text": "Тыквенный ободок вокруг твоего фото в профиле"},
            {"points": 3, "item": "atmo_halloween", "title": "Тема «Хэллоуин»", "text": "Луна, летучие мыши и светлячки в «Оформлении» навсегда"},
            {"points": 4, "item": "edition_halloween", "title": "Золотая паутина", "text": "Золотой свет темы и твой номер. Только для первых 100", "limit": 100},
        ],
    },
}


def _now() -> float:
    """Now. ``NOTKA_FAKE_NOW=2026-10-20`` in .env lets an event be tried before its time."""
    fake = os.environ.get("NOTKA_FAKE_NOW", "").strip()
    if fake:
        try:
            return datetime.strptime(fake, "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc).timestamp()
        except ValueError:
            pass
    return time.time()


def _day(date: str) -> float:
    return datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()


def _load() -> dict:
    try:
        data = json.loads(_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    data.setdefault("users", {})
    data.setdefault("editions", {})  # event -> [user ids in the order they got their number]
    return data


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _FILE.with_name(_FILE.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(_FILE)


def _status(event: dict, now: float) -> tuple[str, int]:
    start, end = _day(event["start"]), _day(event["end"])
    if now < start:
        return "upcoming", int((start - now) // DAY) + 1
    if now >= end:
        return "ended", 0
    return "active", int((end - now) // DAY) + 1


def _tier_limit(event: dict) -> int | None:
    return next((t["limit"] for t in event["tiers"] if t.get("limit")), None)


def _mine(user: dict | None, event_id: str, event: dict, editions: dict) -> dict:
    mine = ((user or {}).get("events") or {}).get(event_id) or {}
    progress = mine.get("progress") or {}
    done = sum(1 for t in event["tasks"] if (progress.get(t["id"]) or 0) >= t["target"])
    return {"progress": progress, "points": done, "items": mine.get("items") or [], "edition": mine.get("edition")}


def public(user_id: int | None) -> list[dict]:
    """The events as the app is shown them, with what this listener has done."""
    now = _now()
    with _lock:
        data = _load()
    user = data["users"].get(str(user_id)) if user_id is not None else None
    out = []
    for event_id, event in EVENTS.items():
        status, days = _status(event, now)
        limit = _tier_limit(event)
        claimed = len(data["editions"].get(event_id, []))
        item = {
            "id": event_id,
            "title": event["title"],
            "atmo": event["atmo"],
            "status": status,
            "days": days,  # days left while active, days to the start before it
            "tasks": event["tasks"],
            "tiers": event["tiers"],
            "editionLeft": None if limit is None else max(0, limit - claimed),
        }
        if user_id is not None:
            item["mine"] = _mine(user, event_id, event, data["editions"])
        out.append(item)
    return out


def sync(user_id: int, event_id: str, progress: dict) -> dict:
    """Take how far each task has got (never backwards), and open the rewards the points have earned."""
    event = EVENTS.get(event_id)
    if not event:
        raise KeyError(event_id)
    status, _ = _status(event, _now())
    with _lock:
        data = _load()
        user = data["users"].setdefault(str(user_id), {})
        mine = user.setdefault("events", {}).setdefault(event_id, {"progress": {}, "items": [], "edition": None})
        if status == "active":
            for task in event["tasks"]:
                try:
                    value = float(progress.get(task["id"], 0))
                except (TypeError, ValueError):
                    continue
                value = max(0.0, min(float(task["target"]), value))
                if value > (mine["progress"].get(task["id"]) or 0):
                    mine["progress"][task["id"]] = round(value, 2)
            points = sum(1 for t in event["tasks"] if (mine["progress"].get(t["id"]) or 0) >= t["target"])
            for tier in event["tiers"]:
                if points < tier["points"] or tier["item"] in mine["items"]:
                    continue
                if tier.get("limit"):
                    claimed = data["editions"].setdefault(event_id, [])
                    if user_id in claimed:
                        mine["edition"] = claimed.index(user_id) + 1
                    elif len(claimed) < tier["limit"]:
                        claimed.append(user_id)
                        mine["edition"] = len(claimed)
                    else:
                        continue  # all of them are taken
                mine["items"].append(tier["item"])
            _save(data)
        result = _mine(user, event_id, event, data["editions"])
    limit = _tier_limit(event)
    result["editionLeft"] = None if limit is None else max(0, limit - len(data["editions"].get(event_id, [])))
    return result


def reset(user_id: int, event_id: str) -> None:
    """For trying an event out: forget what this listener did in it, and give their number back.

    Only while a made-up today is set (``NOTKA_FAKE_NOW``), which is how an
    event is previewed. A real launch has no such line, so this refuses.
    """
    if not os.environ.get("NOTKA_FAKE_NOW", "").strip():
        raise PermissionError("not a preview")
    if event_id not in EVENTS:
        raise KeyError(event_id)
    with _lock:
        data = _load()
        events = (data["users"].get(str(user_id)) or {}).get("events") or {}
        events.pop(event_id, None)
        claimed = data["editions"].get(event_id, [])
        if user_id in claimed:
            claimed.remove(user_id)
        _save(data)
