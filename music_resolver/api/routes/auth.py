import asyncio
import json
import logging
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from music_resolver.services import auth_store, metrics, plus_store, sync_store

logger = logging.getLogger("notka.api.auth")


def register_auth_routes(router: APIRouter) -> None:
    @router.post("/auth/request-code")
    async def auth_request_code(request: Request):
        try:
            body = await request.json()
            username = str(body.get("username") or "")
        except Exception:
            return JSONResponse({"ok": False, "error": "bad_request", "message": "Некорректный запрос"}, status_code=400)
        res = await auth_store.request_code(username)
        logger.info("[AUTH] request-code user=%r result ok=%s", username, res.get("ok"))
        status_code = 200 if res.get("ok") else 400
        return JSONResponse(res, status_code=status_code)

    @router.post("/auth/verify-code")
    async def auth_verify_code(request: Request):
        try:
            body = await request.json()
            username = str(body.get("username") or "")
            code = str(body.get("code") or "")
        except Exception:
            return JSONResponse({"ok": False, "error": "bad_request", "message": "Некорректный запрос"}, status_code=400)
        res = auth_store.verify_code(username, code)
        logger.info("[AUTH] verify-code user=%r code=%r result ok=%s", username, code, res.get("ok"))
        status_code = 200 if res.get("ok") else 400
        return JSONResponse(res, status_code=status_code)

    @router.get("/auth/me")
    async def auth_me(
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default="")
    ):
        user_id = auth_store.resolve_user_id(authorization=authorization, x_auth_token=x_auth_token)
        if not user_id:
            return JSONResponse({"ok": False, "error": "unauthorized"}, status_code=401)
        sync_data = sync_store.load(user_id)
        plus_data = plus_store.status(user_id)
        all_users = metrics.users()
        user_info = all_users.get(str(user_id), {})
        return {
            "ok": True,
            "user": {
                "id": user_id,
                "username": user_info.get("username") or "",
                "name": user_info.get("name") or "",
            },
            "sync": sync_data,
            "plus": plus_data,
        }

    @router.post("/sync")
    async def sync_account(
        request: Request,
        x_telegram_init_data: str = Header(default=""),
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default="")
    ):
        user_id = auth_store.resolve_user_id(x_telegram_init_data, authorization, x_auth_token)
        if user_id is None:
            metrics.count("sync_no_auth" if not x_telegram_init_data and not x_auth_token else "sync_bad_auth")
            return JSONResponse({"error": {"code": "NOT_IN_TELEGRAM"}}, status_code=401)
        raw = await request.body()
        if len(raw) > sync_store.MAX_BYTES:
            metrics.count("sync_too_big")
            return JSONResponse({"error": {"code": "TOO_BIG"}}, status_code=413)
        metrics.count("sync_ok")
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            body = {}
        if not isinstance(body, dict):
            body = {}
        device = body.get("device") if isinstance(body.get("device"), dict) else {}
        profile = metrics.profile_from_init_data(x_telegram_init_data) if x_telegram_init_data else None
        metrics.touch_user(user_id, profile, device.get("id"))
        try:
            return await asyncio.to_thread(sync_store.exchange, user_id, body)
        except sync_store.TooBig:
            return JSONResponse({"error": {"code": "TOO_BIG"}}, status_code=413)
