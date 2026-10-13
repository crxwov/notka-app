import os
import time
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from music_resolver.services import auth_store, events_store, plus_store


def event_user(
    init_data: str = "",
    test_user: str = "",
    auth_header: str = "",
    token_header: str = ""
) -> int | None:
    user_id = auth_store.resolve_user_id(init_data, auth_header, token_header)
    if user_id is None and os.environ.get("NOTKA_TEST_USER", "").isdigit():
        return int(test_user) if test_user.isdigit() else int(os.environ["NOTKA_TEST_USER"])
    return user_id


def grant_plus(user_id: int, days: int, via: str) -> dict:
    if os.environ.get("NOTKA_EVENTS_DIR"):
        return {"plus": True, "until": int(time.time() + days * 86400)}
    return plus_store.grant(user_id, days, via)


def register_events_routes(router: APIRouter) -> None:
    @router.get("/events")
    async def events_list(
        x_telegram_init_data: str = Header(default=""),
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default=""),
        x_notka_test_user: str = Header(default="")
    ) -> dict:
        user_id = event_user(x_telegram_init_data, x_notka_test_user, authorization, x_auth_token)
        return {"events": events_store.public(user_id), "known": user_id is not None}

    @router.post("/events/sync")
    async def events_sync(
        request: Request,
        x_telegram_init_data: str = Header(default=""),
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default=""),
        x_notka_test_user: str = Header(default="")
    ):
        user_id = event_user(x_telegram_init_data, x_notka_test_user, authorization, x_auth_token)
        if user_id is None:
            return JSONResponse({"error": {"code": "NOT_IN_TELEGRAM"}}, status_code=401)
        try:
            body = await request.json()
            progress = body.get("progress") if isinstance(body.get("progress"), dict) else {}
            return events_store.sync(user_id, str(body.get("event") or ""), progress, grant=grant_plus)
        except KeyError:
            return JSONResponse({"error": {"code": "NO_SUCH_EVENT"}}, status_code=404)
        except (ValueError, AttributeError):
            return JSONResponse({"error": {"code": "BAD_REQUEST"}}, status_code=400)

    @router.post("/events/advance")
    async def events_advance() -> dict:
        try:
            return {"devDays": events_store.advance_day()}
        except PermissionError:
            return JSONResponse({"error": {"code": "NOT_A_PREVIEW"}}, status_code=403)

    @router.post("/events/reset")
    async def events_reset(
        request: Request,
        x_telegram_init_data: str = Header(default=""),
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default=""),
        x_notka_test_user: str = Header(default="")
    ):
        user_id = event_user(x_telegram_init_data, x_notka_test_user, authorization, x_auth_token)
        if user_id is None:
            return JSONResponse({"error": {"code": "NOT_IN_TELEGRAM"}}, status_code=401)
        try:
            body = await request.json()
            events_store.reset(user_id, str(body.get("event") or ""))
            return {"ok": True}
        except PermissionError:
            return JSONResponse({"error": {"code": "NOT_A_PREVIEW"}}, status_code=403)
        except (KeyError, ValueError, AttributeError):
            return JSONResponse({"error": {"code": "BAD_REQUEST"}}, status_code=400)
