import asyncio
from pathlib import Path
from urllib.parse import urlparse

from yt_dlp import YoutubeDL

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import PlaybackInfo, ResolvedTrack, TrackCandidate, TrackInfo, public_track_id
from music_resolver.providers.youtube_common import best_thumbnail, expires_at_from_url, mime_from_format

SOUNDCLOUD_HOSTS = {"soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "api.soundcloud.com", "on.soundcloud.com"}


def is_soundcloud_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = parsed.netloc.lower().split(":", 1)[0]
    return host in SOUNDCLOUD_HOSTS or host.endswith(".soundcloud.com")


def soundcloud_track_api_url(track_id: str) -> str:
    return f"https://api.soundcloud.com/tracks/soundcloud%3Atracks%3A{track_id}"


def soundcloud_target(id_or_url: str) -> str:
    value = id_or_url.strip()
    if value.isdigit():
        return soundcloud_track_api_url(value)
    return value


def _artist_from_info(info: dict) -> str:
    artists = info.get("artists") or []
    if artists:
        return ", ".join(str(item) for item in artists if item)
    return info.get("artist") or info.get("uploader") or ""


def _selected_audio_format(info: dict) -> dict | None:
    for key in ("requested_downloads", "requested_formats"):
        for fmt in info.get(key) or []:
            if fmt.get("url") and fmt.get("acodec") not in {None, "none"}:
                return fmt
    if info.get("url") and info.get("acodec") not in {None, "none"}:
        return info

    formats = []
    for fmt in info.get("formats") or []:
        if not fmt.get("url") or fmt.get("acodec") in {None, "none"}:
            continue
        protocol = (fmt.get("protocol") or "").lower()
        ext = (fmt.get("ext") or "").lower()
        format_id = (fmt.get("format_id") or "").lower()
        protocol_bonus = 20 if protocol in {"http", "https"} else 0
        ext_bonus = 10 if ext == "mp3" else 0
        preview_penalty = -2 if "preview" in format_id else 0
        bitrate = fmt.get("abr") or fmt.get("tbr") or 0
        formats.append((protocol_bonus + ext_bonus + preview_penalty, bitrate, fmt))
    if not formats:
        return None
    formats.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return formats[0][2]


class SoundCloudProvider:
    name = "soundcloud"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        return await asyncio.to_thread(self._search_sync, query, limit)

    async def resolve(self, id_or_url: str) -> ResolvedTrack:
        return await asyncio.to_thread(self._resolve_sync, id_or_url)

    def can_handle_url(self, url: str) -> bool:
        return is_soundcloud_url(url)

    def _base_opts(self) -> dict:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "socket_timeout": self.settings.provider_timeout,
            "retries": 0,
            "fragment_retries": 0,
        }
        if self.settings.ytdlp_proxy:
            opts["proxy"] = self.settings.ytdlp_proxy
        return opts

    def _search_sync(self, query: str, limit: int) -> list[TrackCandidate]:
        opts = self._base_opts()
        opts["extract_flat"] = "in_playlist"
        try:
            with YoutubeDL(opts) as ydl:
                data = ydl.extract_info(f"scsearch{limit}:{query}", download=False)
        except Exception as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "SoundCloud search failed") from exc

        results: list[TrackCandidate] = []
        for item in (data or {}).get("entries") or []:
            track_id = str(item.get("id") or "").strip()
            if not track_id:
                continue
            duration = item.get("duration")
            results.append(
                TrackCandidate(
                    id=public_track_id(self.name, track_id),
                    source=self.name,
                    source_id=track_id,
                    title=item.get("track") or item.get("title") or "Unknown",
                    artist=_artist_from_info(item),
                    duration=int(duration) if duration else None,
                    artwork=best_thumbnail(item),
                    source_url=item.get("webpage_url") or item.get("url"),
                )
            )
        return results

    def _resolve_sync(self, id_or_url: str) -> ResolvedTrack:
        target = soundcloud_target(id_or_url)
        if "://" in target and not is_soundcloud_url(target):
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Unsupported or invalid SoundCloud URL")

        opts = self._base_opts()
        opts["format"] = "bestaudio[protocol=http]/bestaudio[protocol=https]/bestaudio/best"
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(target, download=False)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "SoundCloud failed to resolve playback") from exc

        if "entries" in info and info.get("entries"):
            info = next((entry for entry in info["entries"] if entry), info)
        track_id = str(info.get("id") or "").strip()
        if not track_id:
            raise AppError(ErrorCode.RESOLVE_FAILED, "SoundCloud returned metadata without track id")
        selected = _selected_audio_format(info)
        if not selected or not selected.get("url"):
            raise AppError(ErrorCode.RESOLVE_FAILED, "SoundCloud returned no playable audio URL")

        duration = info.get("duration")
        track = TrackInfo(
            id=public_track_id(self.name, track_id),
            source=self.name,
            source_id=track_id,
            title=info.get("track") or info.get("title") or "Unknown",
            artist=_artist_from_info(info),
            duration=int(duration) if duration else None,
            artwork=best_thumbnail(info),
            source_url=info.get("webpage_url"),
        )
        url = selected["url"]
        playback = PlaybackInfo(
            type="url",
            url=url,
            mime_type=mime_from_format(selected) or "audio/mpeg",
            expires_at=expires_at_from_url(url),
        )
        return ResolvedTrack(track=track, playback=playback)

    async def download_to_file(self, id_or_url: str, dest_dir: Path, dest_stem: str) -> tuple[Path, str]:
        target = id_or_url.strip()
        if not target.startswith("http"):
            resolved = await self.resolve(target)
            target = resolved.track.source_url or soundcloud_target(target)
        opts = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestaudio/best",
            "outtmpl": str(dest_dir / f"{dest_stem}.%(ext)s"),
            "overwrites": True,
            "concurrent_fragment_downloads": 4,
            "retries": 3,
            "fragment_retries": 3,
            "geo_bypass": True,
            "geo_bypass_country": "US",
        }
        if self.settings.ytdlp_proxy:
            opts["proxy"] = self.settings.ytdlp_proxy

        def _dl():
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(target, download=True)
                ext = info.get("ext") or "m4a"
                final_path = dest_dir / f"{dest_stem}.{ext}"
                mime = mime_from_format(info) or "audio/mp4"
                return final_path, mime

        return await asyncio.to_thread(_dl)

