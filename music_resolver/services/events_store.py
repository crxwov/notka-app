"""«События»: seasonal tasks and the rewards they open.

An event (Хэллоуин, Новый год…) runs for some days. Every day one new task
opens; every finished task is a point; points open rewards by steps (tiers).
A task that has opened stays open to the end of the event, so a missed day
is not lost. A reward is a theme or days of Нотка Плюс.

What the Mini App does is count the tasks (it sees the listening) and tell
the server how far each one has got. The server decides which tasks are
open today (so the clock of a phone can't open them early), keeps who has
what, and gives the days of Плюс.

Kept in ``data/events.json``. A listener is known by their Telegram user id
from the Mini App's signed ``initData`` (see ``plus_store.verify_init_data``).
"""

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

DATA_DIR = Path(os.environ.get("NOTKA_EVENTS_DIR") or os.environ.get("NOTKA_DATA_DIR") or Path(__file__).resolve().parent.parent.parent / "data")
_FILE = DATA_DIR / "events.json"
_lock = threading.Lock()
DAY = 86400

# ``kind`` says what in the app counts toward a task; ``unique`` tasks count
# different values (different moods) instead of repeats; ``day`` is the day
# of the event on which the task opens.
EVENTS = {
    "halloween": {
        "title": "Хэллоуин",
        "atmo": "halloween",
        "start": "2026-10-22",  # day 1; day 10 is the 31st, the night itself
        "end": "2026-11-03",  # the day after the last; the days after the 31st are for catching up
        "tasks": [
            {"id": "t1", "day": 1, "kind": "listen", "title": "Послушай 10 минут музыки", "target": 10, "unit": "мин"},
            {"id": "t2", "day": 2, "kind": "bat", "title": "Поймай летучую мышь", "target": 1},
            {"id": "t3", "day": 3, "kind": "mood", "title": "Включи микс под настроение", "target": 1, "unique": True},
            {"id": "t4", "day": 4, "kind": "fav", "title": "Отметь сердцем 3 трека", "target": 3},
            {"id": "t5", "day": 5, "kind": "share", "title": "Поделись плейлистом с другом", "target": 1},
            {"id": "t6", "day": 6, "kind": "night", "title": "Послушай музыку после 22:00", "target": 5, "unit": "мин"},
            {"id": "t7", "day": 7, "kind": "mood", "title": "Включи три разных настроения", "target": 3, "unique": True},
            {"id": "t8", "day": 8, "kind": "playlist", "title": "Добавь 3 трека в плейлист", "target": 3},
            {"id": "t9", "day": 9, "kind": "bat", "title": "Поймай 3 летучие мыши", "target": 3},
            {"id": "t10", "day": 10, "kind": "listen", "title": "Послушай 30 минут музыки", "target": 30, "unit": "мин"},
        ],
        "tiers": [
            {"points": 3, "item": "atmo_halloween", "title": "Тема «Хэллоуин»", "text": "Луна, туман, летучие мыши и светлячки: твоя навсегда"},
            {"points": 5, "item": "plus_3", "plusDays": 3, "title": "3 дня Нотки Плюс", "text": "Все темы, настроения и «Машина времени»"},
            {"points": 10, "item": "plus_10", "plusDays": 10, "title": "10 дней Нотки Плюс", "text": "За все десять заданий"},
        ],
    },
}


def _day(date: str) -> float:
    return datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()


def _load() -> dict:
    try:
        data = json.loads(_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    data.setdefault("users", {})
    return data


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _FILE.with_name(_FILE.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(_FILE)


def _preview() -> bool:
    return bool(os.environ.get("NOTKA_FAKE_NOW", "").strip())


def _now(data: dict) -> float:
    """Now. ``NOTKA_FAKE_NOW=2026-10-22`` in .env lets an event be tried before its time;
    while it is set, days can also be moved forward by hand (see ``advance_day``)."""
    fake = os.environ.get("NOTKA_FAKE_NOW", "").strip()
    if fake:
        try:
            base = datetime.strptime(fake, "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc).timestamp()
            return base + int(data.get("devDays", 0)) * DAY
        except ValueError:
            pass
    return time.time()


def _status(event: dict, now: float) -> tuple[str, int]:
    start, end = _day(event["start"]), _day(event["end"])
    if now < start:
        return "upcoming", int((start - now) // DAY) + 1
    if now >= end:
        return "ended", 0
    return "active", int((end - now) // DAY) + 1


def _day_now(event: dict, now: float) -> int:
    """The day of the event (1, 2, …), never more than the number of days it has tasks for."""
    last = max(t["day"] for t in event["tasks"])
    return max(0, min(last, int((now - _day(event["start"])) // DAY) + 1))


def _mine(user: dict | None, event_id: str, event: dict) -> dict:
    mine = ((user or {}).get("events") or {}).get(event_id) or {}
    progress = mine.get("progress") or {}
    done = sum(1 for t in event["tasks"] if (progress.get(t["id"]) or 0) >= t["target"])
    return {"progress": progress, "points": done, "items": mine.get("items") or [], "plusUntil": mine.get("plusUntil")}


def _task_view(task: dict, day_now: int) -> dict:
    # a task that has not opened yet is only a day on the calendar
    if task["day"] > day_now:
        return {"id": task["id"], "day": task["day"], "locked": True}
    return task


def public(user_id: int | None) -> list[dict]:
    """The events as the app is shown them, with what this listener has done."""
    with _lock:
        data = _load()
    now = _now(data)
    user = data["users"].get(str(user_id)) if user_id is not None else None
    out = []
    for event_id, event in EVENTS.items():
        status, days = _status(event, now)
        day_now = _day_now(event, now) if status != "upcoming" else 0
        item = {
            "id": event_id,
            "title": event["title"],
            "atmo": event["atmo"],
            "status": status,
            "days": days,  # days left while active, days to the start before it
            "dayNow": day_now,
            "start": event["start"],
            "tasks": [_task_view(t, day_now) for t in event["tasks"]],
            "tiers": event["tiers"],
        }
        if user_id is not None:
            item["mine"] = _mine(user, event_id, event)
        out.append(item)
    return out


def sync(user_id: int, event_id: str, progress: dict, grant: Callable[[int, int, str], dict] | None = None) -> dict:
    """Take how far each open task has got (never backwards), and open the rewards the points have earned.

    ``grant(user_id, days, via)`` gives days of Плюс and answers with its ``until``.
    """
    event = EVENTS.get(event_id)
    if not event:
        raise KeyError(event_id)
    with _lock:
        data = _load()
        now = _now(data)
        status, _ = _status(event, now)
        day_now = _day_now(event, now) if status != "upcoming" else 0
        user = data["users"].setdefault(str(user_id), {})
        mine = user.setdefault("events", {}).setdefault(event_id, {"progress": {}, "items": []})
        if status == "active":
            for task in event["tasks"]:
                if task["day"] > day_now:
                    continue
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
                if tier.get("plusDays"):
                    if grant is None:
                        continue
                    mine["plusUntil"] = grant(user_id, tier["plusDays"], f"event:{event_id}:{tier['item']}")["until"]
                mine["items"].append(tier["item"])
            _save(data)
        return _mine(user, event_id, event)


# ------------------------------------------------- for trying an event out
def advance_day() -> int:
    """Move the made-up today one day forward. Only while an event is being previewed."""
    if not _preview():
        raise PermissionError("not a preview")
    with _lock:
        data = _load()
        data["devDays"] = int(data.get("devDays", 0)) + 1
        _save(data)
        return data["devDays"]


def reset(user_id: int, event_id: str) -> None:
    """Forget what this listener did in the event, and put the made-up today back.

    Only while a made-up today is set (``NOTKA_FAKE_NOW``), which is how an
    event is previewed. A real launch has no such line, so this refuses.
    """
    if not _preview():
        raise PermissionError("not a preview")
    if event_id not in EVENTS:
        raise KeyError(event_id)
    with _lock:
        data = _load()
        events = (data["users"].get(str(user_id)) or {}).get("events") or {}
        events.pop(event_id, None)
        data["devDays"] = 0
        _save(data)
