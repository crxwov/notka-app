import asyncio
import base64
import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from yt_dlp import YoutubeDL

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import PlaybackInfo, ResolvedTrack, TrackInfo, public_track_id

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def is_youtube_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = parsed.netloc.lower().split(":", 1)[0]
    return host in YOUTUBE_HOSTS or host.endswith(".youtube.com")


def extract_youtube_id(id_or_url: str) -> str | None:
    value = id_or_url.strip()
    if YOUTUBE_ID_RE.match(value):
        return value
    try:
        parsed = urlparse(value)
    except ValueError:
        return None
    if not parsed.scheme or not is_youtube_url(value):
        return None
    if parsed.netloc.lower().endswith("youtu.be"):
        candidate = parsed.path.strip("/").split("/", 1)[0]
        return candidate if YOUTUBE_ID_RE.match(candidate) else None
    params = parse_qs(parsed.query)
    video_id = (params.get("v") or [None])[0]
    if video_id and YOUTUBE_ID_RE.match(video_id):
        return video_id
    parts = [part for part in parsed.path.split("/") if part]
    for marker in ("shorts", "embed", "live"):
        if marker in parts:
            idx = parts.index(marker)
            if idx + 1 < len(parts) and YOUTUBE_ID_RE.match(parts[idx + 1]):
                return parts[idx + 1]
    return None


def youtube_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def music_youtube_url(video_id: str) -> str:
    return f"https://music.youtube.com/watch?v={video_id}"


def mime_from_format(fmt: dict | None) -> str | None:
    if not fmt:
        return None
    mime = fmt.get("mime_type")
    if mime:
        return str(mime).split(";", 1)[0]
    ext = (fmt.get("ext") or "").lower()
    acodec = (fmt.get("acodec") or "").lower()
    if ext == "m4a" or acodec.startswith("mp4a"):
        return "audio/mp4"
    if ext == "webm" or acodec.startswith("opus"):
        return "audio/webm"
    if ext == "mp3":
        return "audio/mpeg"
    if ext == "opus":
        return "audio/ogg"
    return f"audio/{ext}" if ext else None


def expires_at_from_url(url: str) -> str | None:
    try:
        params = parse_qs(urlparse(url).query)
    except ValueError:
        return None
    expire = (params.get("expire") or params.get("Expires") or [None])[0]
    if not expire:
        expire = _cloudfront_policy_expire(params)
    if not expire:
        return None
    try:
        dt = datetime.fromtimestamp(int(expire), tz=timezone.utc)
    except (ValueError, OSError):
        return None
    return dt.isoformat().replace("+00:00", "Z")


def _cloudfront_policy_expire(params: dict[str, list[str]]) -> str | None:
    policy = (params.get("Policy") or [None])[0]
    if not policy:
        return None
    normalized = policy.replace("-", "+").replace("~", "/").replace("_", "=")
    normalized += "=" * (-len(normalized) % 4)
    try:
        decoded = base64.b64decode(normalized)
        data = json.loads(decoded)
    except Exception:
        return None
    expiries = []
    for statement in data.get("Statement", []):
        epoch = (
            statement.get("Condition", {})
            .get("DateLessThan", {})
            .get("AWS:EpochTime")
        )
        if epoch:
            expiries.append(str(epoch))
    return min(expiries) if expiries else None


def best_thumbnail(info: dict) -> str | None:
    thumbnails = info.get("thumbnails") or []
    if not thumbnails:
        video_id = info.get("id")
        return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else None
    scored = []
    for thumb in thumbnails:
        width = thumb.get("width") or 0
        height = thumb.get("height") or 0
        area = width * height
        scored.append((area, thumb.get("url")))
    scored.sort(reverse=True)
    return scored[0][1]


def _selected_audio_format(info: dict) -> dict | None:
    for key in ("requested_downloads", "requested_formats"):
        for fmt in info.get(key) or []:
            if fmt.get("url") and fmt.get("acodec") not in {None, "none"}:
                return fmt
    if info.get("url") and info.get("acodec") not in {None, "none"}:
        return info
    formats = []
    for fmt in info.get("formats") or []:
        if not fmt.get("url"):
            continue
        if fmt.get("acodec") in {None, "none"}:
            continue
        if fmt.get("vcodec") not in {None, "none"}:
            continue
        ext_bonus = {"m4a": 3, "webm": 2, "mp3": 1}.get((fmt.get("ext") or "").lower(), 0)
        bitrate = fmt.get("abr") or fmt.get("tbr") or 0
        formats.append((ext_bonus, bitrate, fmt))
    if not formats:
        return None
    formats.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return formats[0][2]


_COOKIE_ERROR_MARKERS = ("cookie database", "could not copy", "could not decrypt cookie")
# newer Chrome encrypts its cookies so that yt-dlp can't read them; the
# message doesn't mention cookies at all
_COOKIE_DECRYPT_MARKERS = ("failed to decrypt with dpapi",)


# Когда база cookies браузера занята (Chrome открыт), каждая попытка читать её
# заканчивается ошибкой и повтором без cookies: это лишние секунды на каждом треке.
# После первой такой ошибки десять минут идём сразу без cookies.
_cookie_pause_until = 0.0


def _pause_cookies() -> None:
    global _cookie_pause_until
    _cookie_pause_until = time.time() + 600


def _is_cookie_error(exc: Exception) -> bool:
    text = str(exc).lower()
    if any(marker in text for marker in _COOKIE_DECRYPT_MARKERS):
        return True
    return "cookie" in text and any(marker in text for marker in _COOKIE_ERROR_MARKERS)


class YtDlpResolver:
    def __init__(self, settings: Settings, source_name: str) -> None:
        self.settings = settings
        self.source_name = source_name

    async def resolve(self, id_or_url: str) -> ResolvedTrack:
        video_id = extract_youtube_id(id_or_url)
        target = youtube_url(video_id) if video_id else id_or_url
        if not video_id and not is_youtube_url(target):
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Unsupported or invalid YouTube URL")
        info = await asyncio.to_thread(self._extract, target)
        return self._to_resolved(info)

    def _base_opts(self, use_cookies: bool = True) -> dict:
        if use_cookies and time.time() < _cookie_pause_until:
            use_cookies = False
        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
            "socket_timeout": self.settings.provider_timeout,
        }
        if use_cookies and self.settings.ytdlp_cookie_file:
            opts["cookiefile"] = self.settings.ytdlp_cookie_file
        elif use_cookies and self.settings.ytdlp_cookies_from_browser:
            # Reads cookies straight from an installed browser's profile
            # (no export step needed). Lets yt-dlp pass age-gated /
            # "sign in to confirm your age" videos using whatever Google
            # account is logged into that browser on this machine.
            opts["cookiesfrombrowser"] = (self.settings.ytdlp_cookies_from_browser,)
            # Surface cookie-loading warnings (e.g. "could not find Chrome
            # cookie database", "could not decrypt cookie") in the console
            # instead of hiding them under `no_warnings` — needed to debug
            # why age-restricted tracks still fail.
            opts["no_warnings"] = False
        using_browser_cookies = bool(
            (use_cookies and self.settings.ytdlp_cookie_file)
            or (use_cookies and self.settings.ytdlp_cookies_from_browser)
        )
        if self.settings.ytdlp_proxy and not using_browser_cookies:
            # Cookies are tied to the IP they were issued to (this
            # machine's real address). Sending them through YTDLP_PROXY
            # (a datacenter proxy with a different egress IP) is exactly
            # the cookie/IP mismatch YouTube's anti-abuse system flags —
            # every stream request comes back "Playback source returned
            # 403" even though the same track resolves fine with no
            # proxy at all. YTDLP_PROXY is only needed for the YouTube
            # Music/iTunes *search* APIs (config.py already routes those
            # separately via YTMUSIC_PROXY/ITUNES_PROXY); actual
            # googlevideo playback doesn't need it and must not use it
            # once cookies are active.
            opts["proxy"] = self.settings.ytdlp_proxy
        if self.settings.ytdlp_force_ipv6:
            opts["force_ipv6"] = True
        return opts

    def _uses_browser_cookies(self) -> bool:
        return bool(not self.settings.ytdlp_cookie_file and self.settings.ytdlp_cookies_from_browser)

    def _extract(self, target: str) -> dict:
        opts = self._base_opts()
        opts["skip_download"] = True
        opts["retries"] = 0
        opts["fragment_retries"] = 0
        try:
            with YoutubeDL(opts) as ydl:
                return ydl.extract_info(target, download=False)
        except Exception as exc:
            if self._uses_browser_cookies() and _is_cookie_error(exc):
                _pause_cookies()
                # The browser (e.g. Chrome) is open and holds a lock on its
                # own cookie database, so yt-dlp can't copy it out to read
                # from — that's a bug in *this machine's current state*,
                # not in the video. Retry once with no cookies at all:
                # every ordinary (non age-restricted) track resolves fine
                # without them, and cookies only exist here to get past
                # the rare "sign in to confirm your age" gate.
                fallback_opts = self._base_opts(use_cookies=False)
                fallback_opts["skip_download"] = True
                fallback_opts["retries"] = 0
                fallback_opts["fragment_retries"] = 0
                try:
                    with YoutubeDL(fallback_opts) as ydl:
                        return ydl.extract_info(target, download=False)
                except Exception as exc2:
                    raise AppError(ErrorCode.RESOLVE_FAILED, "yt-dlp failed to resolve playback") from exc2
            raise AppError(ErrorCode.RESOLVE_FAILED, "yt-dlp failed to resolve playback") from exc

    async def download_to_file(self, id_or_url: str, dest_dir: Path, dest_stem: str) -> tuple[Path, str]:
        """Download bestaudio for id_or_url into dest_dir using yt-dlp's own
        downloader, and return (final_file_path, mime_type).

        Earlier this proxied the resolved googlevideo.com URL with a plain
        httpx GET, which is what caused the "track reports the wrong
        duration and goes silent partway through" bug: a lot of YouTube's
        audio formats are served as fragmented DASH ("OTF"/SABR) streams,
        where the "url" is a manifest/base URL that has to be fetched in
        per-segment pieces, not one flat byte range. A raw single-GET
        download of such a format produces a file whose declared length
        covers the whole fragmented timeline but which only actually
        contains real audio for the fragments a plain GET happens to catch
        — hence real audio for the first few minutes, then silence, while
        the container's timestamps keep counting up to the full duration.
        yt-dlp's built-in downloader already knows how to fetch fragmented/
        DASH/HLS formats correctly (or picks a non-fragmented format when
        one exists), so downloading through it instead of by hand sidesteps
        the whole class of bug.
        """
        video_id = extract_youtube_id(id_or_url)
        target = youtube_url(video_id) if video_id else id_or_url
        if not video_id and not is_youtube_url(target):
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Unsupported or invalid YouTube URL")
        return await asyncio.to_thread(self._download_sync, target, dest_dir, dest_stem)

    def _download_opts(self, use_cookies: bool, outtmpl: str) -> dict:
        opts = self._base_opts(use_cookies=use_cookies)
        opts["skip_download"] = False
        opts["outtmpl"] = outtmpl
        opts["retries"] = 3
        opts["fragment_retries"] = 3
        opts["overwrites"] = True
        # YouTube slows a single long request down; ten-megabyte pieces go at full speed
        opts["http_chunk_size"] = 10 * 1024 * 1024
        opts["postprocessors"] = []  # audio-only selector, nothing to merge/remux
        return opts

    def _download_sync(self, target: str, dest_dir: Path, dest_stem: str) -> tuple[Path, str]:
        # Download to a unique temp name first so a concurrent request for a
        # *different* track never collides with this one, then the caller
        # atomically renames it into place.
        tmp_stem = f"{dest_stem}.part-{uuid.uuid4().hex}"
        outtmpl = str(dest_dir / (tmp_stem + ".%(ext)s"))
        opts = self._download_opts(use_cookies=True, outtmpl=outtmpl)
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(target, download=True)
                if "entries" in (info or {}) and info.get("entries"):
                    info = next((entry for entry in info["entries"] if entry), info)
                filepath = ydl.prepare_filename(info)
        except Exception as exc:
            for leftover in dest_dir.glob(f"{tmp_stem}*"):
                leftover.unlink(missing_ok=True)
            if self._uses_browser_cookies() and _is_cookie_error(exc):
                _pause_cookies()
                # Same locked-cookie-database problem as _extract (see its
                # comment) — retry once with no cookies before giving up.
                fallback_opts = self._download_opts(use_cookies=False, outtmpl=outtmpl)
                try:
                    with YoutubeDL(fallback_opts) as ydl:
                        info = ydl.extract_info(target, download=True)
                        if "entries" in (info or {}) and info.get("entries"):
                            info = next((entry for entry in info["entries"] if entry), info)
                        filepath = ydl.prepare_filename(info)
                except Exception as exc2:
                    for leftover in dest_dir.glob(f"{tmp_stem}*"):
                        leftover.unlink(missing_ok=True)
                    raise AppError(ErrorCode.RESOLVE_FAILED, "yt-dlp failed to download playback") from exc2
            else:
                raise AppError(ErrorCode.RESOLVE_FAILED, "yt-dlp failed to download playback") from exc
        final_path = Path(filepath)
        if not final_path.exists():
            # requested_downloads carries the post-merge path in some yt-dlp
            # versions when prepare_filename() doesn't match reality.
            downloads = (info or {}).get("requested_downloads") or []
            candidate = downloads[0].get("filepath") if downloads else None
            if candidate and Path(candidate).exists():
                final_path = Path(candidate)
        if not final_path.exists():
            raise AppError(ErrorCode.RESOLVE_FAILED, "yt-dlp reported success but produced no file")
        selected = _selected_audio_format(info) or info or {}
        mime = mime_from_format(selected) or "audio/mpeg"
        return final_path, mime

    def _to_resolved(self, info: dict) -> ResolvedTrack:
        if "entries" in info and info.get("entries"):
            info = next((entry for entry in info["entries"] if entry), info)
        video_id = info.get("id")
        if not video_id:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Provider returned metadata without track id")
        selected = _selected_audio_format(info)
        if not selected or not selected.get("url"):
            raise AppError(ErrorCode.RESOLVE_FAILED, "Provider returned no playable audio URL")

        artist = info.get("artist") or info.get("uploader") or info.get("channel") or ""
        if artist.endswith(" - Topic"):
            artist = artist.removesuffix(" - Topic")
        source_url = info.get("webpage_url") or youtube_url(video_id)
        track = TrackInfo(
            id=public_track_id(self.source_name, video_id),
            source=self.source_name,
            source_id=video_id,
            title=info.get("title") or "Unknown",
            artist=artist,
            duration=int(info["duration"]) if info.get("duration") else None,
            artwork=best_thumbnail(info),
            source_url=source_url,
        )
        url = selected["url"]
        playback = PlaybackInfo(
            type="url",
            url=url,
            mime_type=mime_from_format(selected),
            expires_at=expires_at_from_url(url),
        )
        return ResolvedTrack(track=track, playback=playback)
