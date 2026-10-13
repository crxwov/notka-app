import time
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from music_resolver.services import auth_store, metrics, plus_store

promo_attempts: dict[int, list[float]] = {}


def register_plus_routes(router: APIRouter) -> None:
    @router.get("/plus/status")
    async def plus_status(
        x_telegram_init_data: str = Header(default=""),
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default="")
    ) -> dict:
        user_id = auth_store.resolve_user_id(x_telegram_init_data, authorization, x_auth_token)
        return {**plus_store.status(user_id), "known": user_id is not None}

    @router.post("/plus/redeem")
    async def plus_redeem(
        request: Request,
        x_telegram_init_data: str = Header(default=""),
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default="")
    ):
        user_id = auth_store.resolve_user_id(x_telegram_init_data, authorization, x_auth_token)
        if user_id is None:
            return JSONResponse({"error": {"code": "NOT_IN_TELEGRAM"}}, status_code=401)
        now = time.time()
        tries = [t for t in promo_attempts.get(user_id, []) if now - t < 3600]
        if len(tries) >= 10:
            return JSONResponse({"error": {"code": "TOO_MANY_TRIES"}}, status_code=429)
        promo_attempts[user_id] = tries + [now]
        try:
            body = await request.json()
            code = str(body.get("code") or "")[:40]
        except (ValueError, AttributeError):
            code = ""
        try:
            result = plus_store.redeem(user_id, code)
            metrics.count("promo")
            return result
        except plus_store.PromoError as exc:
            return JSONResponse({"error": {"code": exc.reason}}, status_code=400)
