import asyncio
import hashlib
import hmac
import json
import os
import re
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import FileResponse, JSONResponse

from music_resolver.errors import AppError, ErrorCode
from music_resolver.services import admin_stats, auth_store, metrics, sync_store

admin_page = Path(__file__).resolve().parent.parent.parent.parent / "admin" / "index.html"
admin_fails: dict[str, list[float]] = {}

analytics_dir = sync_store.DATA_DIR / "analytics"
analytics_dir.mkdir(parents=True, exist_ok=True)
analytics_batches: dict[int, list[float]] = {}
ANALYTICS_EVENTS = {"search_submit", "search_pick", "search_empty", "play", "skip", "complete", "play_error", "import", "ranked", "mix_built"}
analytics_pruned = [0.0]
bot_info: dict[str, str] = {}


def _admin_key() -> bytes | None:
    password = os.environ.get("ADMIN_PASSWORD", "").strip()
    if len(password) < 8:
        return None
    return hashlib.sha256((password + "|" + os.environ.get("BOT_TOKEN", "")).encode()).digest()


def _admin_sign(exp: int) -> str:
    key = _admin_key() or b""
    return f"{exp}.{hmac.new(key, str(exp).encode(), hashlib.sha256).hexdigest()}"


def _admin_ok(request: Request) -> bool:
    if _admin_key() is None:
        return False
    value = request.cookies.get("notka_admin", "")
    exp, _, mac = value.partition(".")
    try:
        if int(exp) < time.time():
            return False
    except ValueError:
        return False
    return hmac.compare_digest(value, _admin_sign(int(exp)))


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "?")


def _internal_ok(request: Request) -> bool:
    if request.headers.get("x-forwarded-for"):
        return False
    token = os.environ.get("BOT_TOKEN", "")
    want = hashlib.sha256(("internal|" + token).encode()).hexdigest()[:24]
    return bool(token) and hmac.compare_digest(request.headers.get("x-internal", ""), want)


def _pseudonym(user_id: int) -> str:
    key = (os.environ.get("BOT_TOKEN", "") or "notka").encode()
    return hmac.new(key, f"analytics:{user_id}".encode(), hashlib.sha256).hexdigest()[:12]


def _clean_props(props) -> dict:
    out: dict = {}
    if not isinstance(props, dict):
        return out
    for k, v in list(props.items())[:12]:
        if not isinstance(k, str) or len(k) > 16:
            continue
        if isinstance(v, bool) or isinstance(v, (int, float)):
            out[k] = v
        elif isinstance(v, str):
            out[k] = v[:120]
    return out


def _store_events(pseud: str, device: str, events: list) -> int:
    day = time.strftime("%Y-%m-%d")
    lines = []
    for ev in events[:50]:
        if not isinstance(ev, dict) or ev.get("e") not in ANALYTICS_EVENTS:
            continue
        try:
            at = int(ev.get("t") or 0)
        except (TypeError, ValueError):
            at = 0
        lines.append(json.dumps({"u": pseud, "d": device, "e": ev["e"], "t": at, "p": _clean_props(ev.get("p"))}, ensure_ascii=False, separators=(",", ":")))
    if lines:
        with (analytics_dir / f"{day}.jsonl").open("a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    now = time.time()
    if now - analytics_pruned[0] > 6 * 3600:
        analytics_pruned[0] = now
        for old in analytics_dir.glob("*.jsonl"):
            try:
                if now - old.stat().st_mtime > 60 * 86400:
                    old.unlink(missing_ok=True)
            except OSError:
                pass
    return len(lines)


def register_admin_routes(router: APIRouter) -> None:
    @router.get("/admin")
    @router.get("/admin/")
    async def admin_home():
        return FileResponse(admin_page, media_type="text/html", headers={"cache-control": "no-store"})

    @router.post("/admin/login")
    async def admin_login(request: Request):
        key = _admin_key()
        if key is None:
            return JSONResponse({"error": {"code": "CLOSED"}}, status_code=503)
        ip = _client_ip(request)
        now = time.time()
        fails = [t for t in admin_fails.get(ip, []) if now - t < 900]
        if len(fails) >= 6:
            return JSONResponse({"error": {"code": "TOO_MANY"}}, status_code=429)
        try:
            body = await request.json()
            given = str(body.get("password") or "")
        except ValueError:
            given = ""
        want = os.environ.get("ADMIN_PASSWORD", "").strip()
        if not hmac.compare_digest(given.encode(), want.encode()):
            admin_fails[ip] = fails + [now]
            return JSONResponse({"error": {"code": "WRONG"}}, status_code=401)
        exp = int(now + 7 * 86400)
        response = JSONResponse({"ok": True})
        response.set_cookie("notka_admin", _admin_sign(exp), max_age=7 * 86400, httponly=True, secure=True, samesite="strict", path="/")
        return response

    @router.post("/admin/logout")
    async def admin_logout():
        response = JSONResponse({"ok": True})
        response.delete_cookie("notka_admin", path="/")
        return response

    @router.get("/admin/api/summary")
    async def admin_summary(request: Request):
        if not _admin_ok(request):
            return JSONResponse({"error": {"code": "LOGIN"}}, status_code=401)
        data = await asyncio.to_thread(admin_stats.summary)
        return JSONResponse(data, headers={"cache-control": "no-store"})

    @router.post("/internal/metric")
    async def internal_metric(request: Request, name: str = Query(..., max_length=24)):
        if not _internal_ok(request):
            return JSONResponse({"error": {"code": "NO"}}, status_code=403)
        if re.fullmatch(r"[a-z_]{2,24}", name):
            metrics.count(name)
        return {"ok": True}

    @router.get("/internal/summary")
    async def internal_summary(request: Request):
        if not _internal_ok(request):
            return JSONResponse({"error": {"code": "NO"}}, status_code=403)
        return await asyncio.to_thread(admin_stats.summary)

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/bot-info")
    async def get_bot_info() -> dict[str, str]:
        if bot_info:
            return bot_info
        token = os.environ.get("BOT_TOKEN", "").strip()
        if not token:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Bot is not configured")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(f"https://api.telegram.org/bot{token}/getMe")
                username = res.json()["result"]["username"]
        except Exception as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Could not reach Telegram") from exc
        bot_info["username"] = username
        return bot_info

    @router.post("/analytics")
    async def analytics_in(
        request: Request,
        x_telegram_init_data: str = Header(default=""),
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default="")
    ):
        user_id = auth_store.resolve_user_id(x_telegram_init_data, authorization, x_auth_token)
        if user_id is None:
            return JSONResponse({"error": {"code": "NOT_IN_TELEGRAM"}}, status_code=401)
        now = time.time()
        recent = [t for t in analytics_batches.get(user_id, []) if now - t < 3600]
        if len(recent) >= 120:
            return JSONResponse({"error": {"code": "TOO_MANY"}}, status_code=429)
        raw = await request.body()
        if len(raw) > 64 * 1024:
            return JSONResponse({"error": {"code": "TOO_BIG"}}, status_code=413)
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            return JSONResponse({"error": {"code": "BAD_JSON"}}, status_code=400)
        events = body.get("events") if isinstance(body, dict) else None
        if not isinstance(events, list):
            return JSONResponse({"error": {"code": "BAD_JSON"}}, status_code=400)
        analytics_batches[user_id] = recent + [now]
        device = str(body.get("d") or "")[:12]
        n = await asyncio.to_thread(_store_events, _pseudonym(user_id), device, events)
        metrics.count("an_events", n)
        return {"ok": True, "n": n}
