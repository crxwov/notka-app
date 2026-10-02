import asyncio
import json
import os
import re
import secrets
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import AlbumResponse, ArtistResponse, ResolveResponse, SearchResponse
from music_resolver.services.lyrics import find_lyrics
from music_resolver.services.music_service import MusicService
from music_resolver.services import events_store, mood_mix, plus_store
from music_resolver.services.playlist_import import read_playlist
from music_resolver.utils.remux import defragment, defragment_all

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

# The cache is trimmed back under this size after each new download, least
# recently played tracks first. Override with AUDIO_CACHE_MAX_MB in .env.
_CACHE_MAX_BYTES = int(os.environ.get("AUDIO_CACHE_MAX_MB") or 2048) * 1024 * 1024


def _prune_cache() -> None:
    now = time.time()
    entries = []
    for path in _CACHE_DIR.iterdir():
        try:
            stat = path.stat()
        except OSError:
            continue
        if ".part-" in path.name:
            # leftovers of a download that was cut off; a live one is younger
            if now - stat.st_mtime > 3600:
                path.unlink(missing_ok=True)
        elif path.suffix == ".bin":
            entries.append((stat.st_mtime, stat.st_size, path))
    total = sum(size for _, size, _ in entries)
    for _, size, path in sorted(entries):
        if total <= _CACHE_MAX_BYTES:
            break
        path.unlink(missing_ok=True)
        path.with_suffix(".mime").unlink(missing_ok=True)
        total -= size


def _cached_file(key: str) -> tuple[Path, str] | None:
    meta_path = _CACHE_DIR / f"{key}.mime"
    data_path = _CACHE_DIR / f"{key}.bin"
    try:
        if data_path.stat().st_size > 0:
            mime = meta_path.read_text().strip()
            os.utime(data_path)  # "played just now" — what _prune_cache sorts by
            return data_path, mime
    except OSError:
        pass
    return None


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

    cached = _cached_file(key)
    if cached:
        return cached

    lock = _download_locks.setdefault(key, asyncio.Lock())
    async with lock:
        # Re-check now that we hold the lock: another request for the same
        # track may have finished downloading while we were waiting.
        cached = _cached_file(key)
        if cached:
            return cached

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
                # YouTube's m4a comes in 10-second fragments; some players
                # (Telegram's WebView) go silent after the first one
                await asyncio.to_thread(defragment, tmp_path)
                tmp_path.replace(data_path)
                meta_path.write_text(mime)
            except AppError:
                raise
            except Exception as exc:
                raise AppError(ErrorCode.RESOLVE_FAILED, "Could not download playback source") from exc
            await asyncio.to_thread(_prune_cache)
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
            await asyncio.to_thread(_prune_cache)
        except httpx.HTTPError as exc:
            tmp_path.unlink(missing_ok=True)
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not reach playback source") from exc
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        return data_path, mime


def create_router(service: MusicService, settings: Settings) -> APIRouter:
    router = APIRouter()

    # tracks cached before audio was rewritten on download (see remux.py)
    threading.Thread(target=defragment_all, args=(_CACHE_DIR,), daemon=True).start()

    def match_suffix_for(provider, source_id: str) -> str | None:
        # For a catalog-only source (currently just itunes) whose track id
        # never changes but whose *matched YouTube video* can (see
        # matched_video_id's docstring), fold that match into the cache key
        # so a corrected match isn't shadowed by an old cached download.
        matched_video_id = getattr(provider, "matched_video_id", None)
        return matched_video_id(source_id) if matched_video_id else None

    async def audio_for_resolved(response: ResolveResponse) -> tuple[Path, str]:
        provider = service.manager.get(response.track.source)
        return await _ensure_cached(
            provider,
            response.track.source,
            response.track.source_id,
            response.playback.url,
            response.playback.mime_type,
            match_suffix=match_suffix_for(provider, response.track.source_id),
        )

    async def audio_file(source: str, source_id: str) -> tuple[Path, str]:
        """The track's audio on disk, downloading it first if needed. A track
        that is already cached is found without asking the source anything —
        resolving it again would cost seconds for a file we already hold."""
        provider = service.manager.get(source)
        if provider is not None:
            needs_match = hasattr(provider, "matched_video_id")
            suffix = match_suffix_for(provider, source_id)
            if suffix or not needs_match:
                cached = _cached_file(_cache_key(source, source_id, suffix))
                if cached:
                    return cached
            if not needs_match and hasattr(provider, "download_to_file"):
                # a YouTube track: the downloader looks it up itself, so a
                # separate resolve first would only repeat that lookup
                return await _ensure_cached(provider, source, source_id, "", None)
        response = await service.resolve(source=source, id=source_id, url=None)
        if response.playback.type != "url" or not response.playback.url:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Resolved playback cannot be played")
        return await audio_for_resolved(response)

    def audio_response(data_path: Path, mime: str) -> FileResponse:
        # FileResponse answers Range requests itself, reading only the bytes
        # asked for. no-store: the same /stream URL can point at a corrected
        # file after a backend update, so the WebView must not replay its own
        # old copy.
        return FileResponse(data_path, media_type=mime, headers={"cache-control": "no-store"})

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/search", response_model=SearchResponse)
    async def search(
        q: str = Query(..., min_length=1),
        limit: int = Query(default=None, ge=1, le=50),
    ) -> SearchResponse:
        return await service.search(q, limit=limit or settings.search_limit)

    # ---- artists for the search screen: names with photos. Search itself
    # must not fail because of this, so trouble here is an empty list. ----
    @router.get("/artists")
    async def artists(
        q: str = Query(..., min_length=1, max_length=200),
        limit: int = Query(default=8, ge=1, le=20),
    ) -> dict:
        provider = service.manager.get("youtube_music")
        if provider is None or not hasattr(provider, "search_artists"):
            return {"results": []}
        try:
            found = await asyncio.wait_for(provider.search_artists(q, limit), timeout=settings.provider_timeout)
        except Exception:
            found = []
        return {"results": found}

    # ---- «Перенести плейлист»: the name and the track list behind a
    # Spotify / Yandex Music / Apple Music / YouTube link ----
    @router.get("/import")
    async def import_playlist(url: str = Query(..., min_length=8, max_length=600)) -> dict:
        return await read_playlist(url, youtube_music_provider=service.manager.get("youtube_music"))

    # ---- «Нотка Плюс»: who has it, and promo codes. The listener is
    # recognised by the Mini App's signed initData. ----
    promo_attempts: dict[int, list[float]] = {}

    @router.get("/plus/status")
    async def plus_status(x_telegram_init_data: str = Header(default="")) -> dict:
        user_id = plus_store.verify_init_data(x_telegram_init_data)
        return {**plus_store.status(user_id), "known": user_id is not None}

    @router.post("/plus/redeem")
    async def plus_redeem(request: Request, x_telegram_init_data: str = Header(default="")):
        user_id = plus_store.verify_init_data(x_telegram_init_data)
        if user_id is None:
            return JSONResponse({"error": {"code": "NOT_IN_TELEGRAM"}}, status_code=401)
        # guessing codes by brute force stops here: ten tries an hour
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
            return plus_store.redeem(user_id, code)
        except plus_store.PromoError as exc:
            return JSONResponse({"error": {"code": exc.reason}}, status_code=400)

    # ---- «События»: tasks, rewards and numbered editions (see events_store) ----
    def event_user(init_data: str, test_user: str = "") -> int | None:
        user_id = plus_store.verify_init_data(init_data)
        # for the local test server only: NOTKA_TEST_USER stands in for Telegram,
        # and a test may name its own listener in a header
        if user_id is None and os.environ.get("NOTKA_TEST_USER", "").isdigit():
            return int(test_user) if test_user.isdigit() else int(os.environ["NOTKA_TEST_USER"])
        return user_id

    def grant_plus(user_id: int, days: int, via: str) -> dict:
        # the local test server (it has its own folder for events) gives nothing real
        if os.environ.get("NOTKA_EVENTS_DIR"):
            return {"plus": True, "until": int(time.time() + days * 86400)}
        return plus_store.grant(user_id, days, via)

    @router.get("/events")
    async def events_list(x_telegram_init_data: str = Header(default=""), x_notka_test_user: str = Header(default="")) -> dict:
        user_id = event_user(x_telegram_init_data, x_notka_test_user)
        return {"events": events_store.public(user_id), "known": user_id is not None}

    @router.post("/events/sync")
    async def events_sync(request: Request, x_telegram_init_data: str = Header(default=""), x_notka_test_user: str = Header(default="")):
        user_id = event_user(x_telegram_init_data, x_notka_test_user)
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
    async def events_reset(request: Request, x_telegram_init_data: str = Header(default=""), x_notka_test_user: str = Header(default="")):
        user_id = event_user(x_telegram_init_data, x_notka_test_user)
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
        stream_mode = mode or settings.stream_response_mode
        if stream_mode == "proxy" and source and id and not url:
            data_path, mime = await audio_file(source, id)
            return audio_response(data_path, mime)
        response = await service.resolve(source=source, id=id, url=url)
        if stream_mode == "json":
            return response
        if response.playback.type != "url" or not response.playback.url:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Resolved playback cannot be redirected")
        if stream_mode == "redirect":
            return RedirectResponse(response.playback.url, status_code=307)

        data_path, mime = await audio_for_resolved(response)
        return audio_response(data_path, mime)

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

    # ---- «Текст»: the lyrics of a track, synced line by line when a
    # source has timings for it. An empty list means "no lyrics found". ----
    @router.get("/lyrics")
    async def lyrics(
        title: str = Query(..., min_length=1, max_length=300),
        artist: str = Query(default="", max_length=300),
        duration: float | None = Query(default=None, ge=0, le=36000),
        source: str | None = Query(default=None),
        id: str | None = Query(default=None),
    ) -> dict:
        provider = service.manager.get("youtube_music") if source == "youtube_music" and id else None
        return await find_lyrics(title, artist, duration, youtube_music_provider=provider, video_id=id)

    # ---- «Микс под настроение» (Нотка Плюс): a fresh shuffled set for a mood ----
    @router.post("/mood")
    async def mood(request: Request):
        # the app sends the mood and what it knows of the listener: their
        # own tracks (the mix is grown from those), the artists they listen
        # to and how much of their music is in Russian
        try:
            body = await request.json()
        except ValueError:
            body = {}
        key = str(body.get("key") or "")
        seeds = [s for s in (body.get("seeds") or [])[:40] if isinstance(s, dict) and s.get("source") and s.get("id")]
        artists = [str(a)[:80] for a in (body.get("artists") or [])[:60] if isinstance(a, str)]
        ru_share = body.get("ru_share")
        ru_share = float(ru_share) if isinstance(ru_share, (int, float)) else None
        provider = service.manager.get("youtube_music")
        if provider is None or not hasattr(provider, "mood_tracks"):
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Moods are not available")

        def video_id(source: str, source_id: str) -> str | None:
            if source == "youtube_music":
                return source_id
            other = service.manager.get(source)
            matched = getattr(other, "matched_video_id", None)
            return matched(source_id) if matched else None

        def audio_path(source: str, source_id: str) -> Path | None:
            cached = _cached_file(_cache_key(source, source_id, match_suffix_for(service.manager.get(source), source_id)))
            return cached[0] if cached else None

        try:
            tracks, grown_from = await asyncio.wait_for(
                asyncio.to_thread(mood_mix.build, provider, key, 40, seeds, artists, ru_share, audio_path, video_id), timeout=50
            )
        except asyncio.TimeoutError as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Mood mix timed out") from exc
        except AppError:
            raise
        except Exception as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Mood mix is unavailable") from exc
        return {"results": [t.model_dump(by_alias=True) for t in tracks], "grownFrom": grown_from}

    # ---- gets a track ready to play: the app calls this before pointing
    # its player at /stream (so a failure comes back as a readable error),
    # and ahead of time for the next track in the queue ----
    @router.get("/prepare")
    async def prepare(source: str = Query(..., min_length=1), id: str = Query(..., min_length=1)) -> dict[str, bool]:
        await audio_file(source, id)
        return {"ready": True}

    # ---- «Скачать»: the cached audio as a named file ----
    @router.get("/download")
    async def download(source: str = Query(...), id: str = Query(..., min_length=1)):
        response = await service.resolve(source=source, id=id, url=None)
        if response.playback.type != "url" or not response.playback.url:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Nothing to download")
        data_path, mime = await audio_for_resolved(response)
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
