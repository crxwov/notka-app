import asyncio
import logging
import os
import re
import time
import uuid
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi.responses import FileResponse

from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import ResolveResponse
from music_resolver.services import metrics
from music_resolver.utils.remux import defragment, ffmpeg_exe

logger = logging.getLogger("notka.api.audio")

_UPSTREAM_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

_CACHE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "cache" / "audio_v2"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_download_locks: dict[str, asyncio.Lock] = {}
_download_slots = asyncio.Semaphore(max(1, int(os.environ.get("DOWNLOAD_PARALLEL") or 2)))
_CACHE_MAX_BYTES = int(os.environ.get("AUDIO_CACHE_MAX_MB") or 2048) * 1024 * 1024

mp3_locks: dict[str, asyncio.Lock] = {}
mp3_slots = asyncio.Semaphore(2)


def get_cache_dir() -> Path:
    return _CACHE_DIR


def prune_cache() -> None:
    now = time.time()
    entries = []
    for path in _CACHE_DIR.iterdir():
        try:
            stat = path.stat()
        except OSError:
            continue
        if ".part-" in path.name:
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


def cached_file(key: str) -> tuple[Path, str] | None:
    meta_path = _CACHE_DIR / f"{key}.mime"
    data_path = _CACHE_DIR / f"{key}.bin"
    try:
        if data_path.stat().st_size > 0:
            mime = meta_path.read_text().strip()
            os.utime(data_path)
            return data_path, mime
    except OSError:
        pass
    return None


def cache_key(source: str, source_id: str, match_suffix: str | None = None) -> str:
    raw = f"{source}_{source_id}_{match_suffix}" if match_suffix else f"{source}_{source_id}"
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", raw)
    return safe or uuid.uuid4().hex


def extension_for_mime(mime: str | None) -> str:
    mime = (mime or "").split(";", 1)[0].strip().lower()
    return {
        "audio/mp4": "m4a",
        "audio/webm": "webm",
        "audio/mpeg": "mp3",
        "audio/ogg": "ogg",
    }.get(mime, "audio")


async def download_with_ytdlp(download_to_file, source_id: str, key: str, data_path: Path, meta_path: Path) -> tuple[Path, str]:
    try:
        tmp_path, mime = await download_to_file(source_id, _CACHE_DIR, key)
        tmp_path = Path(tmp_path)
        await asyncio.to_thread(defragment, tmp_path)
        tmp_path.replace(data_path)
        meta_path.write_text(mime)
    except AppError:
        raise
    except Exception as exc:
        raise AppError(ErrorCode.RESOLVE_FAILED, "Could not download playback source") from exc
    await asyncio.to_thread(prune_cache)
    return data_path, mime


async def ensure_cached(
    provider,
    source: str,
    source_id: str,
    upstream_url: str,
    fallback_mime: str | None,
    match_suffix: str | None = None,
) -> tuple[Path, str]:
    key = cache_key(source, source_id, match_suffix)
    meta_path = _CACHE_DIR / f"{key}.mime"
    data_path = _CACHE_DIR / f"{key}.bin"

    cached = cached_file(key)
    if cached:
        return cached

    lock = _download_locks.setdefault(key, asyncio.Lock())
    async with lock:
        cached = cached_file(key)
        if cached:
            return cached

        download_to_file = getattr(provider, "download_to_file", None)
        if download_to_file is not None:
            async with _download_slots:
                return await download_with_ytdlp(download_to_file, source_id, key, data_path, meta_path)

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
            await asyncio.to_thread(prune_cache)
        except httpx.HTTPError as exc:
            tmp_path.unlink(missing_ok=True)
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not reach playback source") from exc
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        return data_path, mime


def match_suffix_for(provider, source_id: str) -> str | None:
    matched_video_id = getattr(provider, "matched_video_id", None)
    return matched_video_id(source_id) if matched_video_id else None


async def audio_for_resolved(service, response: ResolveResponse) -> tuple[Path, str]:
    provider = service.manager.get(response.track.source)
    return await ensure_cached(
        provider,
        response.track.source,
        response.track.source_id,
        response.playback.url,
        response.playback.mime_type,
        match_suffix=match_suffix_for(provider, response.track.source_id),
    )


async def audio_file(service, source: str, source_id: str) -> tuple[Path, str]:
    provider = service.manager.get(source)
    if provider is not None:
        needs_match = hasattr(provider, "matched_video_id")
        suffix = match_suffix_for(provider, source_id)
        if suffix or not needs_match:
            cached = cached_file(cache_key(source, source_id, suffix))
            if cached:
                return cached
        if not needs_match and hasattr(provider, "download_to_file"):
            return await ensure_cached(provider, source, source_id, "", None)
    response = await service.resolve(source=source, id=source_id, url=None)
    if response.playback.type != "url" or not response.playback.url:
        raise AppError(ErrorCode.RESOLVE_FAILED, "Resolved playback cannot be played")
    return await audio_for_resolved(service, response)


def audio_response(data_path: Path, mime: str) -> FileResponse:
    return FileResponse(data_path, media_type=mime, headers={"cache-control": "no-store"})


async def mp3_for(service, source: str, source_id: str, title: str = "", artist: str = "") -> Path:
    path, mime = await audio_file(service, source, source_id)
    if mime.split(";", 1)[0].strip().lower() in ("audio/mpeg", "audio/mp3"):
        return path
    out = path.with_suffix(".mp3")
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
        cmd = [exe, "-y", "-v", "error", "-i", str(path), "-vn", "-map_metadata", "-1",
               "-c:a", "libmp3lame", "-b:a", "192k", "-id3v2_version", "3"]
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
    await asyncio.to_thread(prune_cache)
    return out


def inline_ids_ok(source: str, source_id: str) -> bool:
    return bool(re.fullmatch(r"[a-z_]{3,20}", source) and re.fullmatch(r"[A-Za-z0-9_.\-]{3,64}", source_id))
