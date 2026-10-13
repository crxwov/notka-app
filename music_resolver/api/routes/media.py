import asyncio
import hashlib
import re
import secrets
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Header, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse

from music_resolver.services import plus_store
from music_resolver.api.routes.audio_cache import _UPSTREAM_USER_AGENT, get_cache_dir

cards_dir = get_cache_dir().parent / "cards"
cards_dir.mkdir(parents=True, exist_ok=True)
card_uploads: dict[int, list[float]] = {}

artwork_dir = get_cache_dir().parent / "artwork"
artwork_dir.mkdir(parents=True, exist_ok=True)


def _store_card(raw: bytes, kind: str) -> str:
    now = time.time()
    for old in cards_dir.iterdir():
        try:
            if now - old.stat().st_mtime > 900:
                old.unlink(missing_ok=True)
        except OSError:
            pass
    token = secrets.token_urlsafe(16)
    (cards_dir / f"{token}.{kind}").write_bytes(raw)
    return f"{token}.{kind}"


def register_media_routes(router: APIRouter) -> None:
    @router.post("/card")
    async def card_upload(request: Request, x_telegram_init_data: str = Header(default="")):
        user_id = plus_store.verify_init_data(x_telegram_init_data)
        if user_id is None:
            return JSONResponse({"error": {"code": "NOT_IN_TELEGRAM"}}, status_code=401)
        now = time.time()
        recent = [t for t in card_uploads.get(user_id, []) if now - t < 600]
        if len(recent) >= 20:
            return JSONResponse({"error": {"code": "TOO_MANY"}}, status_code=429)
        raw = await request.body()
        if len(raw) < 100 or len(raw) > 8 * 1024 * 1024:
            return JSONResponse({"error": {"code": "BAD_SIZE"}}, status_code=413)
        if raw[:8] == b"\x89PNG\r\n\x1a\n":
            kind = "png"
        elif raw[:3] == b"\xff\xd8\xff":
            kind = "jpg"
        else:
            return JSONResponse({"error": {"code": "NOT_AN_IMAGE"}}, status_code=415)
        card_uploads[user_id] = recent + [now]
        name = await asyncio.to_thread(_store_card, raw, kind)
        return {"url": f"/card/{name}"}

    @router.get("/card/{name}")
    async def card_get(name: str):
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,32}\.(png|jpg)", name):
            return JSONResponse({"error": {"code": "NOT_FOUND"}}, status_code=404)
        path = cards_dir / name
        if not path.is_file():
            return JSONResponse({"error": {"code": "NOT_FOUND"}}, status_code=404)
        return FileResponse(
            path,
            media_type="image/png" if name.endswith(".png") else "image/jpeg",
            headers={"cache-control": "no-store"},
        )

    @router.get("/artwork")
    async def proxy_artwork(url: str = Query(...)) -> Response:
        if not (url.startswith("http://") or url.startswith("https://")):
            return Response(status_code=400)

        url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
        cache_file = artwork_dir / url_hash
        meta_file = artwork_dir / f"{url_hash}.meta"

        if cache_file.exists() and meta_file.exists():
            try:
                media_type = meta_file.read_text(encoding="utf-8").strip() or "image/jpeg"
                content = await asyncio.to_thread(cache_file.read_bytes)
                return Response(
                    content=content,
                    media_type=media_type,
                    headers={
                        "Cache-Control": "public, max-age=604800, immutable",
                        "Access-Control-Allow-Origin": "*",
                    },
                )
            except Exception:
                pass

        try:
            async with httpx.AsyncClient(
                headers={"User-Agent": _UPSTREAM_USER_AGENT},
                follow_redirects=True,
                timeout=12.0,
            ) as client:
                resp = await client.get(url)
                if resp.status_code != 200:
                    return Response(status_code=resp.status_code)

                content = resp.content
                media_type = resp.headers.get("content-type") or "image/jpeg"

                def _save():
                    try:
                        cache_file.write_bytes(content)
                        meta_file.write_text(media_type, encoding="utf-8")
                    except Exception:
                        pass
                asyncio.create_task(asyncio.to_thread(_save))

                return Response(
                    content=content,
                    media_type=media_type,
                    headers={
                        "Cache-Control": "public, max-age=604800, immutable",
                        "Access-Control-Allow-Origin": "*",
                    },
                )
        except Exception:
            return Response(status_code=502)
