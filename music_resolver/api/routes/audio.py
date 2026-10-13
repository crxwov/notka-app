import asyncio
import re
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import FileResponse, RedirectResponse

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.services import metrics, track_profile
from music_resolver.services.music_service import MusicService
from music_resolver.api.routes.audio_cache import (
    audio_file,
    audio_for_resolved,
    audio_response,
    extension_for_mime,
    inline_ids_ok,
    mp3_for,
)


def register_audio_routes(router: APIRouter, service: MusicService, settings: Settings) -> None:
    @router.api_route("/inline/{source}/{source_id}.mp3", methods=["GET", "HEAD"])
    async def inline_audio(request: Request, source: str, source_id: str, t: str = "", a: str = ""):
        if not inline_ids_ok(source, source_id):
            return Response(status_code=404)
        path = await mp3_for(service, source, source_id, t, a)
        if request.method == "GET":
            metrics.count("inline_send")
        return FileResponse(path, media_type="audio/mpeg", headers={"cache-control": "public, max-age=86400"})

    @router.get("/inline-warm/{source}/{source_id}")
    async def inline_warm(source: str, source_id: str, t: str = "", a: str = "") -> dict:
        if not inline_ids_ok(source, source_id):
            return {"ok": False}
        await mp3_for(service, source, source_id, t, a)
        return {"ok": True}

    @router.get("/stream")
    async def stream(
        request: Request,
        id: str | None = Query(default=None),
        source: str | None = Query(default=None),
        url: str | None = Query(default=None),
        mode: str | None = Query(default=None, pattern="^(redirect|json|proxy)$"),
    ):
        stream_mode = mode or settings.stream_response_mode
        if stream_mode == "proxy" and source and id and not url:
            data_path, mime = await audio_file(service, source, id)
            return audio_response(data_path, mime)
        response = await service.resolve(source=source, id=id, url=url)
        if stream_mode == "json":
            return response
        if response.playback.type != "url" or not response.playback.url:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Resolved playback cannot be redirected")
        if stream_mode == "redirect":
            return RedirectResponse(response.playback.url, status_code=307)

        data_path, mime = await audio_for_resolved(service, response)
        return audio_response(data_path, mime)

    @router.get("/prepare")
    async def prepare(
        source: str = Query(..., min_length=1),
        id: str = Query(..., min_length=1),
        title: str = Query(default="", max_length=200),
        artist: str = Query(default="", max_length=200),
        duration: float | None = Query(default=None, ge=0, le=36000),
    ) -> dict[str, bool]:
        data_path, _mime = await audio_file(service, source, id)
        metrics.count("play")
        if artist or title:
            try:
                track_profile.want_sound(f"{source}_{id}", data_path, duration, title, artist)
            except Exception:
                pass
        return {"ready": True}

    @router.get("/download")
    async def download(source: str = Query(...), id: str = Query(..., min_length=1)):
        response = await service.resolve(source=source, id=id, url=None)
        if response.playback.type != "url" or not response.playback.url:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Nothing to download")
        data_path, mime = await audio_for_resolved(service, response)
        name = f"{response.track.artist} - {response.track.title}".strip(" -") or "track"
        name = re.sub(r'[\\/:*?"<>|]+', " ", name)[:120].strip()
        filename = f"{name}.{extension_for_mime(mime)}"
        ascii_name = filename.encode("ascii", "ignore").decode()
        if not re.search(r"[A-Za-z0-9]", ascii_name.rsplit(".", 1)[0]):
            ascii_name = f"track.{extension_for_mime(mime)}"
        headers = {
            "content-disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}",
            "cache-control": "no-store",
        }
        return FileResponse(data_path, media_type=mime, headers=headers)
