import asyncio
import json
import re
import secrets
from pathlib import Path
from fastapi import APIRouter, Query, Request, Response

from music_resolver.errors import AppError, ErrorCode
from music_resolver.services import metrics
from music_resolver.services.music_service import MusicService
from music_resolver.services.playlist_import import read_playlist
from music_resolver.api.routes.audio_cache import get_cache_dir

track_keys = ("id", "source", "sourceId", "title", "artist", "duration", "artwork", "album", "albumId", "artistId")


def register_playlists_routes(router: APIRouter, service: MusicService) -> None:
    shared_dir = get_cache_dir().parent / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)

    @router.get("/import")
    async def import_playlist(url: str = Query(..., min_length=8, max_length=600)) -> dict:
        metrics.count("import")
        return await read_playlist(url, youtube_music_provider=service.manager.get("youtube_music"))

    @router.post("/shared")
    async def create_shared(request: Request) -> dict[str, str]:
        try:
            body = await request.json()
        except Exception as exc:
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Bad playlist") from exc
        name = str(body.get("name") or "Плейлист")[:60]
        tracks = []
        for t in (body.get("tracks") or [])[:300]:
            if not isinstance(t, dict) or not t.get("source") or not t.get("sourceId"):
                continue
            tracks.append({k: t.get(k) for k in track_keys if t.get(k) is not None})
        if not tracks:
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Playlist is empty")
        share_id = secrets.token_urlsafe(6)
        payload = json.dumps({"name": name, "tracks": tracks}, ensure_ascii=False)
        await asyncio.to_thread((shared_dir / f"{share_id}.json").write_text, payload, "utf-8")
        return {"id": share_id}

    @router.get("/shared/{share_id}")
    async def get_shared(share_id: str) -> Response:
        if not re.fullmatch(r"[A-Za-z0-9_-]{4,32}", share_id):
            raise AppError(ErrorCode.TRACK_NOT_FOUND, "No such playlist")
        path = shared_dir / f"{share_id}.json"
        if not path.exists():
            raise AppError(ErrorCode.TRACK_NOT_FOUND, "No such playlist")
        text = await asyncio.to_thread(path.read_text, "utf-8")
        return Response(content=text, media_type="application/json")
