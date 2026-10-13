import asyncio
import hashlib
import hmac
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
from music_resolver.services import admin_stats, auth_store, events_store, metrics, mood_mix, plus_store, sync_store, track_profile
from music_resolver.services.cache_preloader import CachePreloader
from music_resolver.services.playlist_import import read_playlist
from music_resolver.utils.remux import defragment, defragment_all, ffmpeg_exe

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
# At most this many tracks are downloaded at the same time (each is a yt-dlp + ffmpeg run);
# the rest wait their turn instead of starving the whole 1-CPU server. DOWNLOAD_PARALLEL in .env.
_DOWNLOAD_TOTAL = max(1, int(os.environ.get("DOWNLOAD_PARALLEL") or 2))
_download_slots = asyncio.Semaphore(_DOWNLOAD_TOTAL)

# The cache is trimmed back under this size after each new download, least
# recently played tracks first. 40 GB holds ~10,000+ tracks cleanly on the Russian NVMe server.
_CACHE_MAX_BYTES = int(os.environ.get("AUDIO_CACHE_MAX_MB") or 40000) * 1024 * 1024
_disk_cache_map: dict[str, str] = {}  # f"{source}:{source_id}" -> file_key


def _register_cached_key(key: str) -> None:
    parts = key.split("_")
    if len(parts) >= 2:
        _disk_cache_map[f"{parts[0]}:{parts[1]}"] = key


def _rebuild_disk_cache_map(service: MusicService | None = None) -> None:
    _disk_cache_map.clear()
    if not _CACHE_DIR.exists():
        return
    itunes_provider = service.manager.get("itunes") if service else None
    for path in _CACHE_DIR.glob("*.bin"):
        try:
            if path.stat().st_size <= 0:
                continue
            stem = path.stem
            parts = stem.split("_")
            if len(parts) >= 2:
                src, sid = parts[0], parts[1]
                _disk_cache_map[f"{src}:{sid}"] = stem
                if src == "itunes" and len(parts) >= 3 and itunes_provider:
                    matched_vid = parts[-1]
                    if hasattr(itunes_provider, "_match_cache") and sid not in itunes_provider._match_cache:
                        itunes_provider._match_cache[sid] = matched_vid
        except OSError:
            continue


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
        elif path.suffix in (".bin", ".mp3"):
            entries.append((stat.st_mtime, stat.st_size, path))
    total = sum(size for _, size, _ in entries)
    for _, size, path in sorted(entries):
        if total <= _CACHE_MAX_BYTES:
            break
        path.unlink(missing_ok=True)
        path.with_suffix(".mime").unlink(missing_ok=True)
        total -= size
        parts = path.stem.split("_")
        if len(parts) >= 2:
            _disk_cache_map.pop(f"{parts[0]}:{parts[1]}", None)


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


def _is_track_cached(source: str, source_id: str) -> bool:
    key = _disk_cache_map.get(f"{source}:{source_id}")
    if key and (_CACHE_DIR / f"{key}.bin").exists():
        return True
    safe_prefix = re.sub(r"[^A-Za-z0-9_.-]", "_", f"{source}_{source_id}")
    if (_CACHE_DIR / f"{safe_prefix}.bin").exists():
        return True
    for p in _CACHE_DIR.glob(f"{safe_prefix}_*.bin"):
        try:
            if p.is_file() and p.stat().st_size > 0:
                return True
        except OSError:
            pass
    return False


def _find_cached_track(source: str, source_id: str, suffix: str | None = None) -> tuple[Path, str] | None:
    # 1. Exact match with match suffix
    if suffix:
        direct = _cached_file(_cache_key(source, source_id, suffix))
        if direct:
            return direct

    # 2. Fast in-memory map lookup
    key = _disk_cache_map.get(f"{source}:{source_id}")
    if key:
        cached = _cached_file(key)
        if cached:
            return cached

    # 3. Direct key without suffix
    direct = _cached_file(_cache_key(source, source_id))
    if direct:
        _disk_cache_map[f"{source}:{source_id}"] = _cache_key(source, source_id)
        return direct

    # 4. Pattern match on disk (e.g. itunes_1441456790_*.bin)
    safe_prefix = re.sub(r"[^A-Za-z0-9_.-]", "_", f"{source}_{source_id}")
    for match in _CACHE_DIR.glob(f"{safe_prefix}_*.bin"):
        try:
            if match.is_file() and match.stat().st_size > 0:
                stem = match.stem
                meta_path = match.with_suffix(".mime")
                if meta_path.exists():
                    mime = meta_path.read_text().strip() or "audio/mp4"
                    os.utime(match)
                    _disk_cache_map[f"{source}:{source_id}"] = stem
                    return match, mime
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


async def _download_with_ytdlp(download_to_file, source_id: str, key: str, data_path: Path, meta_path: Path) -> tuple[Path, str]:
    try:
        tmp_path, mime = await download_to_file(source_id, _CACHE_DIR, key)
        tmp_path = Path(tmp_path)
        # YouTube's m4a comes in 10-second fragments; some players
        # (Telegram's WebView) go silent after the first one
        await asyncio.to_thread(defragment, tmp_path)
        tmp_path.replace(data_path)
        meta_path.write_text(mime)
        _register_cached_key(key)
    except AppError:
        raise
    except Exception as exc:
        raise AppError(ErrorCode.RESOLVE_FAILED, "Could not download playback source") from exc
    await asyncio.to_thread(_prune_cache)
    return data_path, mime


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
            async with _download_slots:
                return await _download_with_ytdlp(download_to_file, source_id, key, data_path, meta_path)
            # Preferred path: let yt-dlp's own downloader fetch the track.
            # It correctly reassembles fragmented/DASH/HLS audio formats,
            # which a plain single-GET byte download of the resolved URL
            # does not — that mismatch was the root cause of tracks that
            # reported the wrong duration and went silent partway through.
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
            _register_cached_key(key)
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
    _rebuild_disk_cache_map(service)

    def match_suffix_for(provider, source_id: str) -> str | None:
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
        suffix = match_suffix_for(provider, source_id) if provider else None
        cached = _find_cached_track(source, source_id, suffix)
        if cached:
            return cached
        if provider is not None:
            needs_match = hasattr(provider, "matched_video_id")
            if not needs_match and hasattr(provider, "download_to_file"):
                return await _ensure_cached(provider, source, source_id, "", None)
        response = await service.resolve(source=source, id=source_id, url=None)
        if response.playback.type != "url" or not response.playback.url:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Resolved playback cannot be played")
        return await audio_for_resolved(response)

    # Background preloader that keeps all user playlist/favorite tracks permanently cached on local disk
    cache_preloader = CachePreloader(
        cache_dir=_CACHE_DIR,
        data_dir=sync_store.DATA_DIR,
        download_fn=audio_file,
        is_cached_fn=_is_track_cached,
    )

    @router.on_event("startup")
    async def _start_preloader():
        cache_preloader.start()

    def audio_response(data_path: Path, mime: str) -> FileResponse:
        return FileResponse(
            data_path,
            media_type=mime,
            headers={
                "cache-control": "public, max-age=604800, stale-while-revalidate=86400",
                "accept-ranges": "bytes",
            },
        )

    # ---- inline mode: «@бот запрос» in any chat puts the song itself into it.
    # Telegram takes the file from an address and wants an ordinary MP3, so the
    # downloaded audio is converted once and kept next to it. ----
    mp3_locks: dict[str, asyncio.Lock] = {}
    mp3_slots = asyncio.Semaphore(2)  # converting is heavy for a small server

    _COVER_HOSTS = re.compile(r"^https://([a-z0-9-]+\.)*(googleusercontent\.com|ggpht\.com|ytimg\.com|mzstatic\.com|dzcdn\.net|sndcdn\.com)/")

    async def _cover_file(url: str, stem: str) -> Path | None:
        """The cover of a track as a small JPEG next to its audio (for the tag inside the mp3); None when it cannot be had."""
        if not url or not _COVER_HOSTS.match(url):
            return None
        url = re.sub(r"=w\d+-h\d+[^\s]*$", "=w600-h600-l90-rj", url)
        dest = _CACHE_DIR / f"{stem}.cover.jpg"
        try:
            if dest.stat().st_size > 1000:
                return dest
        except OSError:
            pass
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                res = await client.get(url, headers={"User-Agent": _UPSTREAM_USER_AGENT})
            if res.status_code == 200 and 1000 < len(res.content) < 3_000_000:
                dest.write_bytes(res.content)
                return dest
        except Exception:  # noqa: BLE001 - the track goes without a cover, not without a file
            pass
        return None

    async def mp3_for(source: str, source_id: str, title: str = "", artist: str = "", cover: str = "") -> Path:
        path, mime = await audio_file(source, source_id)
        # «.cv»: converted with the cover inside (the older files without it are left to be pruned)
        out = path.with_name(path.stem + ".cv.mp3")
        try:
            if out.stat().st_size > 0:
                os.utime(out)
                return out
        except OSError:
            pass
        exe = ffmpeg_exe()
        if not exe:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Audio conversion is not available")
        lock = mp3_locks.setdefault(out.name, asyncio.Lock())
        async with lock:
            try:
                if out.stat().st_size > 0:
                    return out
            except OSError:
                pass
            tmp = out.with_name(f"{out.stem}.part-{uuid.uuid4().hex}.mp3")
            cover_path = await _cover_file(cover, path.stem)
            cmd = [exe, "-y", "-v", "error", "-i", str(path)]
            if cover_path is not None:
                cmd += ["-i", str(cover_path), "-map", "0:a", "-map", "1:v", "-c:v", "mjpeg", "-vf", "scale=500:500:force_original_aspect_ratio=decrease",
                        "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)", "-disposition:v", "attached_pic"]
            else:
                cmd += ["-vn"]
            cmd += ["-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "160k", "-compression_level", "9", "-id3v2_version", "3"]
            if title:
                cmd += ["-metadata", f"title={title[:120]}"]
            if artist:
                cmd += ["-metadata", f"artist={artist[:120]}"]
            cmd.append(str(tmp))
            try:
                async with mp3_slots:
                    proc = await asyncio.create_subprocess_exec(
                        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE
                    )
                    await asyncio.wait_for(proc.communicate(), timeout=240)
                if proc.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
                    raise AppError(ErrorCode.RESOLVE_FAILED, "Could not convert the track")
                tmp.replace(out)
            finally:
                tmp.unlink(missing_ok=True)
        await asyncio.to_thread(_prune_cache)
        return out

    def _inline_ids_ok(source: str, source_id: str) -> bool:
        return bool(re.fullmatch(r"[a-z_]{3,20}", source) and re.fullmatch(r"[A-Za-z0-9_.\-]{3,64}", source_id))

    @router.api_route("/inline/{source}/{source_id}.mp3", methods=["GET", "HEAD"])
    async def inline_audio(request: Request, source: str, source_id: str, t: str = "", a: str = "", c: str = ""):
        if not _inline_ids_ok(source, source_id):
            return Response(status_code=404)
        path = await mp3_for(source, source_id, t, a, c)
        if request.method == "GET":
            metrics.count("inline_send")
        return FileResponse(path, media_type="audio/mpeg", headers={"cache-control": "public, max-age=86400"})

    # ---- the admin site: /admin, protected by reverse proxy Basic Auth ----
    admin_page = Path(__file__).resolve().parent.parent.parent / "admin" / "index.html"

    @router.get("/admin")
    @router.get("/admin/")
    async def admin_home():
        return FileResponse(admin_page, media_type="text/html", headers={"cache-control": "no-store"})

    @router.post("/admin/login")
    async def admin_login():
        return JSONResponse({"ok": True})

    @router.post("/admin/logout")
    async def admin_logout():
        return JSONResponse({"ok": True})

    @router.get("/admin/api/summary")
    async def admin_summary(request: Request):
        data = await asyncio.to_thread(admin_stats.summary, cache_preloader.status())
        return JSONResponse(data, headers={"cache-control": "no-store"})

    # ---- the bot (same machine, no forwarding header) reports counters and asks for the summary ----
    def _internal_ok(request: Request) -> bool:
        if request.headers.get("x-forwarded-for"):
            return False
        token = os.environ.get("BOT_TOKEN", "")
        want = hashlib.sha256(("internal|" + token).encode()).hexdigest()[:24]
        return bool(token) and hmac.compare_digest(request.headers.get("x-internal", ""), want)

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
        return await asyncio.to_thread(admin_stats.summary, cache_preloader.status())

    @router.get("/inline-thumb/{source}/{source_id}.jpg")
    async def inline_thumb(source: str, source_id: str, c: str = ""):
        """The cover as a thumbnail Telegram accepts for an audio file: JPEG, at most 320 px, well under 200 KB."""
        if not _inline_ids_ok(source, source_id):
            return Response(status_code=404)
        src = await _cover_file(c, f"{source}_{source_id}")
        exe = ffmpeg_exe()
        if src is None or not exe:
            return Response(status_code=404)
        out = src.with_name(src.stem + ".t320.jpg")
        if not out.exists() or out.stat().st_size < 500:
            proc = await asyncio.create_subprocess_exec(
                exe, "-y", "-v", "error", "-i", str(src), "-vf", "scale=320:320:force_original_aspect_ratio=decrease", "-q:v", "6", str(out),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.communicate(), timeout=20)
        if not out.exists() or out.stat().st_size < 500:
            return Response(status_code=404)
        return FileResponse(out, media_type="image/jpeg", headers={"cache-control": "public, max-age=86400"})

    @router.get("/inline-warm/{source}/{source_id}")
    async def inline_warm(source: str, source_id: str, t: str = "", a: str = "", c: str = "") -> dict:
        # called by the bot for the first results of a query, so that by the time one is picked it is ready
        if not _inline_ids_ok(source, source_id):
            return {"ok": False}
        await mp3_for(source, source_id, t, a, c)
        return {"ok": True}

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/search", response_model=SearchResponse)
    async def search(
        q: str = Query(..., min_length=1),
        limit: int = Query(default=None, ge=1, le=50),
    ) -> SearchResponse:
        metrics.count("search")
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

    # ---- a picture the app has made (a lyric card, a recap), handed back as a plain
    # https link: Telegram's own «save file» takes a link, not a blob. Kept a quarter
    # of an hour, then gone. Only for people inside Telegram, and not many at a time. ----
    cards_dir = _CACHE_DIR.parent / "cards"
    cards_dir.mkdir(parents=True, exist_ok=True)
    card_uploads: dict[int, list[float]] = {}

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

    # ---- product analytics: small events (a search that found nothing, a skip, a failed
    # track…) that tell what to improve in search and mixes. Pseudonymous: the person is
    # a keyed hash, not a Telegram id. Kept 60 days. The app can switch it off. ----
    analytics_dir = sync_store.DATA_DIR / "analytics"
    analytics_dir.mkdir(parents=True, exist_ok=True)
    analytics_batches: dict[int, list[float]] = {}
    ANALYTICS_EVENTS = {"search_submit", "search_pick", "search_empty", "play", "skip", "complete", "play_error", "import", "ranked", "mix_built"}
    analytics_pruned = [0.0]

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

    @router.post("/analytics")
    async def analytics_in(request: Request, x_telegram_init_data: str = Header(default="")):
        user_id = plus_store.verify_init_data(x_telegram_init_data)
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

    # ---- «Перенести плейлист»: the name and the track list behind a
    # Spotify / Yandex Music / Apple Music / YouTube link ----
    @router.get("/import")
    async def import_playlist(url: str = Query(..., min_length=8, max_length=600)) -> dict:
        metrics.count("import")
        return await read_playlist(url, youtube_music_provider=service.manager.get("youtube_music"))

    # ---- «Нотка Плюс»: who has it, and promo codes. The listener is
    # recognised by the Mini App's signed initData. ----
    promo_attempts: dict[int, list[float]] = {}

    # ---- «один аккаунт — все устройства»: the listener's favourites, playlists,
    # settings and listening stats under their Telegram account (see sync_store) ----
    # ---- sign in to the mobile app (the Android app of the other branch): a code from the bot, then a session token ----
    @router.post("/auth/request-code")
    async def auth_request_code(request: Request):
        try:
            body = await request.json()
            username = str(body.get("username") or "")
        except Exception:
            return JSONResponse({"ok": False, "error": "bad_request", "message": "Некорректный запрос"}, status_code=400)
        res = await auth_store.request_code(username)
        return JSONResponse(res, status_code=200 if res.get("ok") else 400)

    @router.post("/auth/verify-code")
    async def auth_verify_code(request: Request):
        try:
            body = await request.json()
            username = str(body.get("username") or "")
            code = str(body.get("code") or "")
        except Exception:
            return JSONResponse({"ok": False, "error": "bad_request", "message": "Некорректный запрос"}, status_code=400)
        res = auth_store.verify_code(username, code)
        return JSONResponse(res, status_code=200 if res.get("ok") else 400)

    @router.get("/auth/me")
    async def auth_me(authorization: str = Header(default=""), x_auth_token: str = Header(default="")):
        user_id = auth_store.resolve_user_id(authorization=authorization, x_auth_token=x_auth_token)
        if not user_id:
            return JSONResponse({"ok": False, "error": "unauthorized"}, status_code=401)
        user_info = metrics.users().get(str(user_id), {})
        return {
            "ok": True,
            "user": {"id": user_id, "username": user_info.get("username") or "", "name": user_info.get("name") or ""},
            "sync": sync_store.load(user_id),
            "plus": plus_store.status(user_id),
        }

    @router.post("/sync")
    async def sync_account(
        request: Request,
        x_telegram_init_data: str = Header(default=""),
        authorization: str = Header(default=""),
        x_auth_token: str = Header(default=""),
    ):
        # a Mini App is known by its signed initData, the mobile app by its session token
        user_id = auth_store.resolve_user_id(x_telegram_init_data, authorization, x_auth_token)
        if user_id is None:
            # counted, so the admin site shows how often a device is turned away (empty data = not opened as a Mini App)
            metrics.count("sync_no_auth" if not (x_telegram_init_data or x_auth_token) else "sync_bad_auth")
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
        metrics.touch_user(user_id, metrics.profile_from_init_data(x_telegram_init_data) if x_telegram_init_data else None, device.get("id"))
        try:
            cur = await asyncio.to_thread(sync_store.exchange, user_id, body)
            if cache_preloader and isinstance(body.get("shared"), dict):
                cache_preloader.enqueue_from_sync_data(body["shared"])
            return cur
        except sync_store.TooBig:
            return JSONResponse({"error": {"code": "TOO_BIG"}}, status_code=413)

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
            result = plus_store.redeem(user_id, code)
            metrics.count("promo")
            return result
        except plus_store.PromoError as exc:
            return JSONResponse({"error": {"code": exc.reason}}, status_code=400)

    # ---- «События»: a task a day, themes and days of Плюс as rewards (see events_store) ----
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
        fast: bool = Query(default=False),
    ) -> ArtistResponse:
        info = await service.get_artist(source, id, fast=fast)
        return ArtistResponse(**info.model_dump(by_alias=True))

    @router.api_route("/stream", methods=["GET", "HEAD"])
    async def stream(
        request: Request,
        id: str | None = Query(default=None),
        source: str | None = Query(default=None),
        url: str | None = Query(default=None),
        mode: str | None = Query(default=None, pattern="^(redirect|json|proxy)$"),
    ):
        if cache_preloader:
            cache_preloader.notify_user_playback(20.0)
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
        known: str = Query(default="", max_length=2500),
    ) -> SearchResponse:
        provider = service.manager.get(source)
        if provider is None or not hasattr(provider, "radio"):
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "This source has no radio")
        known_artists = [a.strip().lower() for a in known.split("|") if a.strip()][:80]
        try:
            tracks = await asyncio.wait_for(provider.radio(id, limit, known_artists), timeout=max(settings.provider_timeout, 14))
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
        metrics.count("lyrics")
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
        metrics.count("mood")
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
    async def prepare(
        source: str = Query(..., min_length=1),
        id: str = Query(..., min_length=1),
        title: str = Query(default="", max_length=200),
        artist: str = Query(default="", max_length=200),
        duration: float | None = Query(default=None, ge=0, le=36000),
    ) -> dict[str, bool]:
        if cache_preloader:
            cache_preloader.notify_user_playback(20.0)
        data_path, _mime = await audio_file(source, id)
        metrics.count("play")  # one per started track: the app asks for this once for each
        # the track is on disk now: what it sounds like is measured once, in the background
        if artist or title:
            try:
                track_profile.want_sound(f"{source}_{id}", data_path, duration, title, artist)
            except Exception:  # never in the listener's way
                pass
        return {"ready": True}

    # ---- ahead of a tap: the first tracks of a search are made ready while the listener looks at them,
    # so the tap starts them at once. Only when the server is idle (a listener's own request is never
    # held up), one at a time, a few at once at most, and rate-limited. ----
    warm_pending: set[str] = set()
    warm_slot = asyncio.Semaphore(1)
    warm_times: list[float] = []
    WARM_PER_MINUTE = 30

    async def _warm_one(source: str, source_id: str) -> None:
        key = f"{source}:{source_id}"
        try:
            async with warm_slot:
                # wait (briefly) for a moment when every download slot is free
                for _ in range(16):
                    if _download_slots._value >= _DOWNLOAD_TOTAL:
                        break
                    await asyncio.sleep(0.5)
                else:
                    return
                await asyncio.wait_for(audio_file(source, source_id), timeout=60)
                metrics.count("warm_done")
        except Exception:  # never in anybody's way
            pass
        finally:
            warm_pending.discard(key)

    @router.get("/warm")
    async def warm(source: str = Query(..., min_length=1, max_length=20), id: str = Query(..., min_length=1, max_length=64)) -> dict[str, bool]:
        key = f"{source}:{id}"
        now = time.time()
        warm_times[:] = [t for t in warm_times if now - t < 60]
        if _DOWNLOAD_TOTAL < 2 or key in warm_pending or len(warm_pending) >= 4 or len(warm_times) >= WARM_PER_MINUTE:
            return {"queued": False}
        if not re.fullmatch(r"[A-Za-z0-9_.\-]{3,64}", id) or not re.fullmatch(r"[a-z_]{3,20}", source):
            return {"queued": False}
        # nothing to do for a track that is on disk already
        if _is_track_cached(source, id):
            return {"queued": False}
        provider = service.manager.get(source)
        if provider is None:
            return {"queued": False}
        suffix = match_suffix_for(provider, id)
        if (suffix or not hasattr(provider, "matched_video_id")) and _cached_file(_cache_key(source, id, suffix)):
            return {"queued": False}
        warm_times.append(now)
        warm_pending.add(key)
        metrics.count("warm")
        asyncio.create_task(_warm_one(source, id))
        return {"queued": True}

    # ---- who made a track: performers, writers, producers, label (open sources, see services/credits.py) ----
    @router.get("/credits")
    async def credits(
        title: str = Query(..., min_length=1, max_length=300),
        artist: str = Query(default="", max_length=300),
        duration: float | None = Query(default=None, ge=0, le=36000),
    ) -> dict:
        from music_resolver.services import credits as credits_service

        try:
            return await asyncio.wait_for(credits_service.find_credits(title, artist, int(duration or 0)), timeout=30)
        except Exception:  # noqa: BLE001 - the block just does not appear
            return {"found": False}

    # ---- saved remakes: the original of a track that a hidden catalog once replaced with a fan remake ----
    originals_calls: list[float] = []

    @router.post("/originals")
    async def originals(request: Request):
        from music_resolver.services import originals as originals_service

        try:
            body = await request.json()
        except ValueError:
            body = {}
        now = time.time()
        originals_calls[:] = [t for t in originals_calls if now - t < 60]
        if len(originals_calls) >= 20:
            return JSONResponse({"error": {"code": "TOO_MANY"}}, status_code=429)
        originals_calls.append(now)
        tracks = [
            {k: t.get(k) for k in ("id", "sourceId", "title", "artist", "artistId", "duration")}
            for t in (body.get("tracks") or [])[:originals_service.MAX_TRACKS]
            if isinstance(t, dict) and t.get("source") == "youtube_music"
        ]
        provider = service.manager.get("youtube_music")
        if not tracks or provider is None or not hasattr(provider, "_client"):
            return {"replacements": {}}
        client = provider._client()
        found, retry = await asyncio.wait_for(asyncio.to_thread(originals_service.find_originals, client, tracks), timeout=45)
        if found:
            metrics.count("originals_found", len(found))
        return {"replacements": found, "retry": retry}

    # ---- what Нотка knows about a track: sound, mood fit, the artist's genres ----
    @router.get("/profile")
    async def track_profile_view(source: str = Query(...), id: str = Query(...), artist: str = Query(default="")) -> dict:
        key = f"{source}_{id}"
        own = track_profile.known(key)
        fits = {}
        for mood in track_profile.MOODS:
            fit, how = track_profile.fit_for(key, artist, mood)
            fits[mood] = {"fit": fit, "from": how}
        ak = track_profile.artist_key(artist)
        with track_profile._lock:
            tags = (track_profile._artists_db().get(ak) or {}).get("tags") or []
        track_profile.want_artist(artist)
        return {"sound": own, "moods": fits, "tags": tags, "profiled_tracks": track_profile.known_count()}

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
