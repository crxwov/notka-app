"""Who has «Нотка Плюс», and the promo codes that give it.

Kept in one small JSON file (``data/plus.json``) that both the backend and
the bot open: the bot's owner creates codes with a command, the Mini App
redeems them through the API. Every operation reads the file, changes it
and writes it back in one go, so the two processes never work on a stale
copy.

A listener is known by their Telegram user id, taken from the Mini App's
``initData`` — a string Telegram signs with the bot's token, so it can't be
made up by hand (see ``verify_init_data``).
"""

import hashlib
import hmac
import json
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import parse_qsl

DATA_DIR = Path(os.environ.get("NOTKA_DATA_DIR") or Path(__file__).resolve().parent.parent.parent / "data")
_FILE = DATA_DIR / "plus.json"
_lock = threading.Lock()

DAY = 86400
# initData is signed once, when the Mini App opens; a session can stay open
# for a long time, so it is accepted for a while after that
_INIT_DATA_MAX_AGE = 14 * DAY

_CODE_RE = re.compile(r"^[A-ZА-ЯЁ0-9_-]{3,24}$")


class PromoError(Exception):
    """A code can't be redeemed; ``reason`` is one of the names below."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason  # NOT_FOUND | EXPIRED | EXHAUSTED | ALREADY_USED | BAD_CODE


def normalize_code(code: str) -> str:
    return re.sub(r"\s+", "", code or "").upper()


def _load() -> dict:
    try:
        data = json.loads(_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    data.setdefault("users", {})
    data.setdefault("codes", {})
    return data


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _FILE.with_name(_FILE.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(_FILE)


# ------------------------------------------------------------- who is asking
def verify_init_data(init_data: str, bot_token: str | None = None) -> int | None:
    """The Telegram user id behind a Mini App's initData, or None if the
    string isn't a genuine, reasonably fresh one signed with our bot token."""
    bot_token = bot_token or os.environ.get("BOT_TOKEN", "").strip()
    if not init_data or not bot_token:
        return None
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=True))
    except ValueError:
        return None
    their_hash = pairs.pop("hash", "")
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()

    def matches(fields: dict) -> bool:
        check = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
        return hmac.compare_digest(hmac.new(secret, check.encode(), hashlib.sha256).hexdigest(), their_hash)

    # Telegram hashes every field it sent except `hash` itself — including
    # the newer `signature`. (Checked without it too, for clients that
    # predate that field's place in the hash.)
    without_signature = {key: value for key, value in pairs.items() if key != "signature"}
    if not their_hash or not (matches(pairs) or matches(without_signature)):
        return None
    try:
        if time.time() - int(pairs.get("auth_date", "0")) > _INIT_DATA_MAX_AGE:
            return None
        return int(json.loads(pairs.get("user", "{}"))["id"])
    except (ValueError, KeyError, TypeError):
        return None


# ------------------------------------------------------------------ status
def status(user_id: int | None) -> dict:
    if user_id is None:
        return {"plus": False, "until": None}
    with _lock:
        until = (_load()["users"].get(str(user_id)) or {}).get("until") or 0
    return {"plus": until > time.time(), "until": int(until) if until > time.time() else None}


def grant(user_id: int, days: int, via: str) -> dict:
    """Add days of Плюс; days already paid for are kept and extended."""
    with _lock:
        data = _load()
        user = data["users"].setdefault(str(user_id), {})
        start = max(time.time(), user.get("until") or 0)
        user["until"] = int(start + days * DAY)
        user.setdefault("history", []).append({"at": int(time.time()), "days": days, "via": via})
        _save(data)
        return {"plus": True, "until": user["until"]}


# ------------------------------------------------------------- promo codes
def create_code(code: str, days: int, limit: int, valid_days: int | None = None, note: str = "") -> dict:
    code = normalize_code(code)
    if not _CODE_RE.match(code) or not (1 <= days <= 3660) or not (1 <= limit <= 1_000_000):
        raise PromoError("BAD_CODE")
    with _lock:
        data = _load()
        existing = data["codes"].get(code) or {}
        data["codes"][code] = {
            "days": days,
            "limit": limit,
            "expires": int(time.time() + valid_days * DAY) if valid_days else None,
            "used": existing.get("used", {}),  # re-creating a code keeps who has used it
            "note": note,
            "off": False,
        }
        _save(data)
        return data["codes"][code]


def disable_code(code: str) -> bool:
    code = normalize_code(code)
    with _lock:
        data = _load()
        if code not in data["codes"]:
            return False
        data["codes"][code]["off"] = True
        _save(data)
        return True


def list_codes() -> dict:
    with _lock:
        return _load()["codes"]


def redeem(user_id: int, code: str) -> dict:
    code = normalize_code(code)
    with _lock:
        data = _load()
        entry = data["codes"].get(code)
        if not entry or entry.get("off"):
            raise PromoError("NOT_FOUND")
        if entry.get("expires") and entry["expires"] < time.time():
            raise PromoError("EXPIRED")
        if str(user_id) in entry["used"]:
            raise PromoError("ALREADY_USED")
        if len(entry["used"]) >= entry["limit"]:
            raise PromoError("EXHAUSTED")
        entry["used"][str(user_id)] = int(time.time())
        user = data["users"].setdefault(str(user_id), {})
        start = max(time.time(), user.get("until") or 0)
        user["until"] = int(start + entry["days"] * DAY)
        user.setdefault("history", []).append({"at": int(time.time()), "days": entry["days"], "via": f"promo:{code}"})
        _save(data)
        return {
            "plus": True,
            "until": user["until"],
            "days": entry["days"],
            "left": entry["limit"] - len(entry["used"]),
            "limit": entry["limit"],
        }
