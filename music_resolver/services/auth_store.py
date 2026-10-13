"""Mobile app Telegram authentication and session manager for Notka.

Allows mobile app users to log in with their Telegram @username:
1. Checks that the user is registered in Notka (data/users.json).
2. Sends a 6-digit confirmation code via the Telegram bot.
3. Verifies the code, issues a persistent session token, and returns the
   user's synced state (favorites, playlists, settings).
4. Validates session tokens on all protected API routes.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import threading
import time
from pathlib import Path
from urllib.parse import quote

import httpx

from music_resolver.services import metrics, plus_store, sync_store

logger = logging.getLogger("notka.auth")

DATA_DIR = Path(os.environ.get("NOTKA_DATA_DIR") or Path(__file__).resolve().parent.parent.parent / "data")
_SESSIONS_FILE = DATA_DIR / "sessions.json"
_LOCK = threading.Lock()

# In-memory pending verification codes: clean_query -> {code, user_id, username, name, expires_at, attempts, last_sent}
_PENDING_CODES: dict[str, dict] = {}

# Persistent sessions: token -> {user_id, username, name, created_at}
_SESSIONS: dict[str, dict] = {}


def _load_sessions() -> dict[str, dict]:
    try:
        if _SESSIONS_FILE.exists():
            data = json.loads(_SESSIONS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception as exc:
        logger.warning("Could not read sessions file: %s", exc)
    return {}


def _save_sessions() -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = _SESSIONS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(_SESSIONS, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, _SESSIONS_FILE)
    except Exception as exc:
        logger.error("Could not save sessions: %s", exc)


# Initialize sessions on module import
_SESSIONS.update(_load_sessions())


def normalize_query(query: str) -> str:
    return (query or "").strip().lstrip("@").lower()


def find_user(query: str) -> tuple[int, dict] | None:
    """Find a registered user by Telegram @username, numeric ID, or display name."""
    clean = normalize_query(query)
    if not clean:
        return None

    def _search(users_map: dict) -> tuple[int, dict] | None:
        # 1. Exact match on username (case-insensitive)
        for uid_str, data in users_map.items():
            uname = (data.get("username") or "").strip().lstrip("@").lower()
            if uname and uname == clean:
                try:
                    return int(uid_str), data
                except ValueError:
                    continue

        # 2. Match by numeric user_id
        if clean.isdigit() and clean in users_map:
            try:
                return int(clean), users_map[clean]
            except ValueError:
                pass

        # 3. Match by name or first_name (case-insensitive)
        for uid_str, data in users_map.items():
            name = (data.get("name") or "").strip().lower()
            if name and name == clean:
                try:
                    return int(uid_str), data
                except ValueError:
                    continue

        # 4. Prefix match if clean is at least 3 chars (e.g. 'hackov' matches 'hackov_crew')
        candidates = []
        if len(clean) >= 3:
            for uid_str, data in users_map.items():
                uname = (data.get("username") or "").strip().lstrip("@").lower()
                name = (data.get("name") or "").strip().lower()
                if uname and (uname.startswith(clean) or clean.startswith(uname)):
                    candidates.append((uid_str, data))
                elif name and (name.startswith(clean) or clean.startswith(name)):
                    candidates.append((uid_str, data))
        if len(candidates) == 1:
            try:
                return int(candidates[0][0]), candidates[0][1]
            except ValueError:
                pass

        return None

    # First check in-memory users cache
    all_users = metrics.users()
    res = _search(all_users)
    if res:
        return res

    # Fallback: re-read users.json directly from disk
    try:
        disk_users = metrics._read(metrics._USERS)
        if disk_users:
            res = _search(disk_users)
            if res:
                with metrics._LOCK:
                    metrics._users.update(disk_users)
                return res
    except Exception as exc:
        logger.warning("Error reading disk users: %s", exc)

    return None


def generate_code_for_user(user_id: int, username: str = "", name: str = "") -> str:
    """Generate a 6-digit confirmation code directly for a known Telegram user (e.g. from the bot)."""
    now = time.time()
    code = f"{secrets.randbelow(900000) + 100000}"
    entry = {
        "code": code,
        "user_id": user_id,
        "username": username or str(user_id),
        "name": name or "Пользователь",
        "expires_at": now + 300,
        "attempts": 0,
        "last_sent": now,
    }
    with _LOCK:
        _PENDING_CODES[str(user_id)] = entry
        if username:
            _PENDING_CODES[normalize_query(username)] = entry
        _PENDING_CODES[f"code:{code}"] = entry
    logger.info("[AUTH] Generated code for user_id=%s username=%s", user_id, username)
    return code


async def send_telegram_code(user_id: int, code: str) -> tuple[bool, str]:
    """Send verification code to Telegram user via Bot API."""
    bot_token = os.environ.get("BOT_TOKEN", "").strip()
    if not bot_token:
        logger.error("BOT_TOKEN is not configured in .env")
        return False, "Бот не настроен на сервере"

    msg = (
        f"🔐 <b>Вход в мобильное приложение Нотка</b>\n\n"
        f"Твой код подтверждения: <code>{code}</code>\n\n"
        f"Введи этот 6-значный код в приложении на телефоне.\n"
        f"⏳ Код действует 5 минут.\n"
        f"⚠️ Никому не сообщай этот код!"
    )

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": user_id,
        "text": msg,
        "parse_mode": "HTML",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            data = resp.json()
            if data.get("ok"):
                return True, "ok"
            err_desc = data.get("description", "Unknown error")
            logger.warning("Telegram sendMessage failed for %s: %s", user_id, err_desc)
            if "bot was blocked" in err_desc.lower() or "chat not found" in err_desc.lower():
                return False, "Бот заблокирован или чат с ботом не начат. Открой нашего бота @notka_app_bot в Telegram и нажми /start."
            return False, f"Ошибка Telegram: {err_desc}"
    except Exception as exc:
        logger.exception("Failed to contact Telegram API")
        return False, f"Ошибка сети при отправке в Telegram: {exc}"


async def request_code(query: str) -> dict:
    """Request a 6-digit confirmation code for a given Telegram username or numeric ID."""
    clean = normalize_query(query)
    if not clean:
        return {"ok": False, "error": "empty_username", "message": "Введите ваш юзернейм или ID в Telegram"}

    logger.info("[AUTH] request_code query=%r clean=%r", query, clean)
    user_info = find_user(clean)

    # If not found in users.json, but user passed numeric Telegram ID: attempt direct message
    if not user_info and clean.isdigit():
        target_uid = int(clean)
        now = time.time()
        code = f"{secrets.randbelow(900000) + 100000}"
        success, err_msg = await send_telegram_code(target_uid, code)
        if success:
            metrics.touch_user(target_uid, profile={"name": f"ID {target_uid}"})
            entry = {
                "code": code,
                "user_id": target_uid,
                "username": str(target_uid),
                "name": f"ID {target_uid}",
                "expires_at": now + 300,
                "attempts": 0,
                "last_sent": now,
            }
            with _LOCK:
                _PENDING_CODES[clean] = entry
                _PENDING_CODES[f"code:{code}"] = entry
            return {
                "ok": True,
                "message": "Код подтверждения отправлен в Telegram бота!",
                "user_id": target_uid,
                "name": f"ID {target_uid}",
                "username": str(target_uid),
            }

    if not user_info:
        logger.warning("[AUTH] User not found for query=%r", query)
        return {
            "ok": False,
            "error": "user_not_found",
            "message": f"Пользователь «{query}» не найден в базе Нотки. Открой бота @notka_app_bot в Telegram и отправь команду /code — бот сразу выдаст код!",
        }

    user_id, data = user_info
    name = data.get("name") or data.get("username") or "Пользователь"
    username = data.get("username") or clean

    now = time.time()
    with _LOCK:
        existing = _PENDING_CODES.get(clean) or _PENDING_CODES.get(str(user_id))
        if existing and now - existing.get("last_sent", 0) < 30:
            rem = int(30 - (now - existing.get("last_sent", 0)))
            return {
                "ok": False,
                "error": "rate_limit",
                "message": f"Подожди {rem} сек. перед повторной отправкой кода",
            }

        # Generate 6-digit code
        code = f"{secrets.randbelow(900000) + 100000}"
        entry = {
            "code": code,
            "user_id": user_id,
            "username": username,
            "name": name,
            "expires_at": now + 300,
            "attempts": 0,
            "last_sent": now,
        }
        _PENDING_CODES[clean] = entry
        _PENDING_CODES[str(user_id)] = entry
        _PENDING_CODES[f"code:{code}"] = entry

    success, err_msg = await send_telegram_code(user_id, code)
    if not success:
        with _LOCK:
            _PENDING_CODES.pop(clean, None)
            _PENDING_CODES.pop(str(user_id), None)
            _PENDING_CODES.pop(f"code:{code}", None)
        return {
            "ok": False,
            "error": "send_failed",
            "message": err_msg,
        }

    return {
        "ok": True,
        "message": "Код подтверждения отправлен в Telegram бота!",
        "user_id": user_id,
        "name": name,
        "username": username,
    }


def verify_code(query: str, code: str) -> dict:
    """Verify the 6-digit code and create a persistent session token."""
    clean = normalize_query(query)
    clean_code = (code or "").strip().replace(" ", "")

    if not clean_code:
        return {"ok": False, "error": "empty_code", "message": "Введите 6-значный код"}

    now = time.time()
    pending = None

    with _LOCK:
        # 1. Match by clean query / user_id
        if clean and clean in _PENDING_CODES:
            cand = _PENDING_CODES[clean]
            if cand.get("code") == clean_code:
                pending = cand

        # 2. Match by direct code index
        if not pending and f"code:{clean_code}" in _PENDING_CODES:
            pending = _PENDING_CODES[f"code:{clean_code}"]

        # 3. Linear scan active unexpired pending codes
        if not pending:
            for k, cand in list(_PENDING_CODES.items()):
                if cand.get("code") == clean_code and cand.get("expires_at", 0) > now:
                    pending = cand
                    break

        if not pending:
            return {
                "ok": False,
                "error": "not_requested",
                "message": "Код не запрашивался или устарел. Отправь /code в боте @notka_app_bot.",
            }

        if now > pending.get("expires_at", 0):
            return {
                "ok": False,
                "error": "expired",
                "message": "Срок действия кода истёк. Запросите новый код.",
            }

        if pending.get("attempts", 0) >= 5:
            return {
                "ok": False,
                "error": "too_many_attempts",
                "message": "Слишком много неверных попыток. Запросите новый код.",
            }

        # Code matches! Generate session token
        token = secrets.token_hex(32)
        user_id = pending["user_id"]
        username = pending["username"]
        name = pending["name"]

        _SESSIONS[token] = {
            "user_id": user_id,
            "username": username,
            "name": name,
            "created_at": now,
        }
        _PENDING_CODES.pop(clean, None)
        _save_sessions()

    # Load synced data
    sync_data = sync_store.load(user_id)
    plus_data = plus_store.status(user_id)

    return {
        "ok": True,
        "token": token,
        "user": {
            "id": user_id,
            "username": username,
            "name": name,
        },
        "sync": sync_data,
        "plus": plus_data,
    }


def get_session(token: str) -> dict | None:
    """Get active session by token."""
    if not token:
        return None
    with _LOCK:
        return _SESSIONS.get(token)


def get_user_id_by_token(token: str) -> int | None:
    """Extract user_id from session token."""
    sess = get_session(token)
    return sess.get("user_id") if sess else None


def resolve_user_id(
    x_telegram_init_data: str = "",
    authorization: str = "",
    x_auth_token: str = ""
) -> int | None:
    """Unified user authentication: accepts mobile session token OR Telegram initData."""
    # 1. Custom mobile header X-Auth-Token
    if x_auth_token:
        uid = get_user_id_by_token(x_auth_token)
        if uid:
            return uid

    # 2. Authorization: Bearer <token>
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        uid = get_user_id_by_token(token)
        if uid:
            return uid

    # 3. Telegram WebApp initData
    if x_telegram_init_data:
        return plus_store.verify_init_data(x_telegram_init_data)

    return None
