import asyncio

from yt_dlp import YoutubeDL

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import TrackCandidate, public_track_id
from music_resolver.providers.youtube_common import YtDlpResolver, extract_youtube_id, is_youtube_url, youtube_url


class YoutubeWebProvider:
    name = "youtube_web"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._resolver = YtDlpResolver(settings, self.name)

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        return await asyncio.to_thread(self._search_sync, query, limit)

    async def resolve(self, id_or_url: str):
        return await self._resolver.resolve(id_or_url)

    async def download_to_file(self, id_or_url: str, dest_dir, dest_stem: str):
        return await self._resolver.download_to_file(id_or_url, dest_dir, dest_stem)

    def can_handle_url(self, url: str) -> bool:
        return is_youtube_url(url)

    def _search_sync(self, query: str, limit: int) -> list[TrackCandidate]:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": "in_playlist",
            "socket_timeout": self.settings.provider_timeout,
            "retries": 0,
        }
        if self.settings.ytdlp_cookie_file:
            opts["cookiefile"] = self.settings.ytdlp_cookie_file
        if self.settings.ytdlp_proxy:
            opts["proxy"] = self.settings.ytdlp_proxy
        if self.settings.ytdlp_force_ipv6:
            opts["force_ipv6"] = True
        try:
            with YoutubeDL(opts) as ydl:
                data = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
        except Exception as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "yt-dlp search failed") from exc
        results: list[TrackCandidate] = []
        for item in (data or {}).get("entries") or []:
            video_id = item.get("id") or item.get("url")
            if not video_id or not extract_youtube_id(video_id):
                continue
            thumbnails = item.get("thumbnails") or []
            artwork = thumbnails[-1].get("url") if thumbnails else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
            artist = item.get("artist") or item.get("uploader") or item.get("channel") or ""
            if artist.endswith(" - Topic"):
                artist = artist.removesuffix(" - Topic")
            results.append(
                TrackCandidate(
                    id=public_track_id(self.name, video_id),
                    source=self.name,
                    source_id=video_id,
                    title=item.get("title") or "Unknown",
                    artist=artist,
                    duration=int(item["duration"]) if item.get("duration") else None,
                    artwork=artwork,
                    source_url=youtube_url(video_id),
                )
            )
        return results
