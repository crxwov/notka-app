import asyncio
import json
import os
import re
import secrets
import uuid
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse, RedirectResponse, Response

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import AlbumResponse, ArtistResponse, ResolveResponse, SearchResponse
from music_resolver.services.music_service import MusicService

# Some CDNs (incl. googlevideo.com) reject requests with no/odd User-Agent.
_UPSTREAM_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Where downloaded audio is cached on disk, keyed by source+id, then served
# from that local copy for every byte-range request — replays of the same
# track are instant, and it avoids re-hitting the resolved URL live.
#
# This is the *second* cache directory ("audio_v2", not "audio"): tracks
# were downloaded once by a plain single-GET on the resolved googlevideo.com
# URL, and it turns out some of YouTube's audio formats are served as
# fragmented DASH/OTF streams where that "url" is a manifest/base URL, not
# one flat file — a plain GET only picks up part of the real audio, padded
# out to the full duration with silence. Downloads now go through yt-dlp's
# own downloader instead (see youtube_common.download_to_file), which
# reassembles fragmented formats correctly. Using a fresh directory makes
# sure no stale, silently-broken file from the old download path gets served
# again just because it happens to already be on disk.
_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "cache" / "audio_v2"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_download_locks: dict[str, asyncio.Lock] = {}


def _cache_key(source: str, source_id: str, match_suffix: str | None = None) -> str:
    # match_suffix (e.g. the YouTube video id a catalog-only source like
    # itunes actually matched to) is folded into the key so that a track
    # whose *match* changes — after fixing the matcher, say — gets a fresh
    # cache entry instead of forever replaying whatever audio an earlier,
    # wrong match already downloaded under the same source+id. Without
    # this, source+id alone (stable for the life of the iTunes track) would
    # make the on-disk cache immortal and immune to any matching-logic fix.
    raw = f"{source}_{source_id}_{match_suffix}" if match_suffix else f"{source}_{source_id}"
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", raw)
    return safe or uuid.uuid4().hex


def _extension_for_mime(mime: str | None) -> str:
    mime = (mime or "").split(";", 1)[0].strip().lower()
    return {
        "audio/mp4": "m4a",
        "audio/webm": "webm",
        "audio/mpeg": "mp3",
        "audio/ogg": "ogg",
    }.get(mime, "audio")


async def _ensure_cached(
    provider,
    source: str,
    source_id: str,
    upstream_url: str,
    fallback_mime: str | None,
    match_suffix: str | None = None,
) -> tuple[Path, str]:
    key = _cache_key(source, source_id, match_suffix)
    meta_path = _CACHE_DIR / f"{key}.mime"
    data_path = _CACHE_DIR / f"{key}.bin"

    if data_path.exists() and meta_path.exists() and data_path.stat().st_size > 0:
        return data_path, meta_path.read_text().strip()

    lock = _download_locks.setdefault(key, asyncio.Lock())
    async with lock:
        # Re-check now that we hold the lock: another request for the same
        # track may have finished downloading while we were waiting.
        if data_path.exists() and meta_path.exists() and data_path.stat().st_size > 0:
            return data_path, meta_path.read_text().strip()

        download_to_file = getattr(provider, "download_to_file", None)
        if download_to_file is not None:
            # Preferred path: let yt-dlp's own downloader fetch the track.
            # It correctly reassembles fragmented/DASH/HLS audio formats,
            # which a plain single-GET byte download of the resolved URL
            # does not — that mismatch was the root cause of tracks that
            # reported the wrong duration and went silent partway through.
            try:
                tmp_path, mime = await download_to_file(source_id, _CACHE_DIR, key)
                tmp_path = Path(tmp_path)
                tmp_path.replace(data_path)
                meta_path.write_text(mime)
            except AppError:
                raise
            except Exception as exc:
                raise AppError(ErrorCode.RESOLVE_FAILED, "Could not download playback source") from exc
            return data_path, mime

        # Fallback for providers with no yt-dlp downloader hook (e.g.
        # soundcloud, whose resolved URLs are plain progressive files) —
        # stream the already-resolved URL directly.
        headers = {"User-Agent": _UPSTREAM_USER_AGENT, "Range": "bytes=0-"}
        tmp_path = _CACHE_DIR / f"{key}.part-{uuid.uuid4().hex}"
        mime = fallback_mime or "audio/mpeg"
        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                async with client.stream("GET", upstream_url, headers=headers) as upstream:
                    if upstream.status_code >= 400:
                        raise AppError(
                            ErrorCode.RESOLVE_FAILED, f"Playback source returned {upstream.status_code}"
                        )
                    mime = (upstream.headers.get("content-type") or mime).split(";", 1)[0].strip() or mime
                    with open(tmp_path, "wb") as fh:
                        async for chunk in upstream.aiter_bytes():
                            fh.write(chunk)
            tmp_path.replace(data_path)
            meta_path.write_text(mime)
        except httpx.HTTPError as exc:
            tmp_path.unlink(missing_ok=True)
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not reach playback source") from exc
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        return data_path, mime


def _parse_range(range_header: str, total: int) -> tuple[int, int]:
    try:
        _, _, rng = range_header.partition("=")
        start_s, _, end_s = rng.partition("-")
        start = int(start_s) if start_s.strip() else 0
        end = int(end_s) if end_s.strip() else total - 1
        end = min(end, total - 1)
        if start < 0 or start > end:
            return 0, total - 1
        return start, end
    except (ValueError, IndexError):
        return 0, total - 1


def create_router(service: MusicService, settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/search", response_model=SearchResponse)
    async def search(
        q: str = Query(..., min_length=1),
        limit: int = Query(default=None, ge=1, le=50),
    ) -> SearchResponse:
        return await service.search(q, limit=limit or settings.search_limit)

    @router.get("/resolve", response_model=ResolveResponse)
    async def resolve(
        source: str | None = Query(default=None),
        id: str | None = Query(default=None),
        url: str | None = Query(default=None),
    ) -> ResolveResponse:
        return await service.resolve(source=source, id=id, url=url)

    @router.get("/album", response_model=AlbumResponse)
    async def album(
        source: str | None = Query(default=None),
        id: str | None = Query(default=None),
    ) -> AlbumResponse:
        info = await service.get_album(source, id)
        return AlbumResponse(**info.model_dump(by_alias=True))

    @router.get("/artist", response_model=ArtistResponse)
    async def artist(
        source: str | None = Query(default=None),
        id: str | None = Query(default=None),
    ) -> ArtistResponse:
        info = await service.get_artist(source, id)
        return ArtistResponse(**info.model_dump(by_alias=True))

    @router.get("/stream")
    async def stream(
        request: Request,
        id: str | None = Query(default=None),
        source: str | None = Query(default=None),
        url: str | None = Query(default=None),
        mode: str | None = Query(default=None, pattern="^(redirect|json|proxy)$"),
    ):
        response = await service.resolve(source=source, id=id, url=url)
        stream_mode = mode or settings.stream_response_mode
        if stream_mode == "json":
            return response
        if response.playback.type != "url" or not response.playback.url:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Resolved playback cannot be redirected")
        if stream_mode == "redirect":
            return RedirectResponse(response.playback.url, status_code=307)

        provider = service.manager.get(response.track.source)
        # For a catalog-only source (currently just itunes) whose track id
        # never changes but whose *matched YouTube video* can (see
        # matched_video_id's docstring), fold that match into the cache key
        # so a corrected match isn't shadowed by an old cached download.
        matched_video_id = getattr(provider, "matched_video_id", None)
        match_suffix = matched_video_id(response.track.source_id) if matched_video_id else None
        data_path, mime = await _ensure_cached(
            provider,
            response.track.source,
            response.track.source_id,
            response.playback.url,
            response.playback.mime_type,
            match_suffix=match_suffix,
        )
        file_bytes = await asyncio.to_thread(data_path.read_bytes)
        total = len(file_bytes)
        range_header = request.headers.get("range")
        if range_header:
            start, end = _parse_range(range_header, total)
            chunk = file_bytes[start : end + 1]
            headers = {
                "content-range": f"bytes {start}-{end}/{total}",
                "accept-ranges": "bytes",
                "content-length": str(len(chunk)),
                # The same /stream?source=&id= URL can end up pointing at a
                # fixed (previously broken) file after a backend update —
                # make sure Telegram's WebView always re-checks with us
                # instead of replaying whatever it cached the first time.
                "cache-control": "no-store",
            }
            return Response(content=chunk, status_code=206, media_type=mime, headers=headers)

        headers = {"accept-ranges": "bytes", "content-length": str(total), "cache-control": "no-store"}
        return Response(content=file_bytes, status_code=200, media_type=mime, headers=headers)

    # ---- «Мой микс»: what YouTube Music's radio would play after a track ----
    @router.get("/radio", response_model=SearchResponse)
    async def radio(
        source: str = Query(...),
        id: str = Query(..., min_length=1),
        limit: int = Query(default=25, ge=1, le=50),
    ) -> SearchResponse:
        provider = service.manager.get(source)
        if provider is None or not hasattr(provider, "radio"):
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "This source has no radio")
        try:
            tracks = await asyncio.wait_for(provider.radio(id, limit), timeout=settings.provider_timeout)
        except asyncio.TimeoutError as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Radio timed out") from exc
        except AppError:
            raise
        except Exception as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Radio is unavailable") from exc
        return SearchResponse(results=tracks)

    # ---- «Скачать»: the cached audio as a named file ----
    @router.get("/download")
    async def download(source: str = Query(...), id: str = Query(..., min_length=1)):
        response = await service.resolve(source=source, id=id, url=None)
        if response.playback.type != "url" or not response.playback.url:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Nothing to download")
        provider = service.manager.get(response.track.source)
        matched_video_id = getattr(provider, "matched_video_id", None)
        match_suffix = matched_video_id(response.track.source_id) if matched_video_id else None
        data_path, mime = await _ensure_cached(
            provider,
            response.track.source,
            response.track.source_id,
            response.playback.url,
            response.playback.mime_type,
            match_suffix=match_suffix,
        )
        name = f"{response.track.artist} - {response.track.title}".strip(" -") or "track"
        name = re.sub(r'[\\/:*?"<>|]+', " ", name)[:120].strip()
        filename = f"{name}.{_extension_for_mime(mime)}"
        ascii_name = filename.encode("ascii", "ignore").decode()
        if not re.search(r"[A-Za-z0-9]", ascii_name.rsplit(".", 1)[0]):
            ascii_name = f"track.{_extension_for_mime(mime)}"
        headers = {
            "content-disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}",
            "cache-control": "no-store",
        }
        return FileResponse(data_path, media_type=mime, headers=headers)

    # ---- the bot's username, for t.me share links ----
    bot_info: dict[str, str] = {}

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

    # ---- shared playlists: stored as small JSON files, fetched by id ----
    shared_dir = _CACHE_DIR.parent / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)
    track_keys = ("id", "source", "sourceId", "title", "artist", "duration", "artwork", "album", "albumId", "artistId")

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

    return router
