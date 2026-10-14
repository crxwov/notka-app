import inspect
from datetime import datetime, timezone

from music_resolver.cache.ttl import TTLCache
from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import AlbumInfo, ArtistInfo, ResolveResponse, SearchResponse
from music_resolver.services.provider_manager import ProviderManager
from music_resolver.utils.ids import parse_public_id


class MusicService:
    def __init__(self, manager: ProviderManager, settings: Settings) -> None:
        self.manager = manager
        self.settings = settings
        self.search_cache: TTLCache[SearchResponse] = TTLCache(settings.cache_ttl, maxsize=2048)
        self.resolve_cache: TTLCache[ResolveResponse] = TTLCache(settings.resolve_cache_ttl, maxsize=2048)
        self.album_cache: TTLCache[AlbumInfo] = TTLCache(settings.cache_ttl, maxsize=1024)
        self.artist_cache: TTLCache[ArtistInfo] = TTLCache(settings.cache_ttl, maxsize=1024)

    async def search(self, query: str, limit: int) -> SearchResponse:
        query = (query or "").strip()
        if not query:
            raise AppError(ErrorCode.INVALID_QUERY, "Query must not be empty")
        key = f"search:{limit}:{query.lower()}"
        cached = self.search_cache.get(key)
        if cached:
            return cached
        results = await self.manager.search(query, limit)
        response = SearchResponse(results=results[:limit])  # a provider may hand back more than asked
        self.search_cache.set(key, response)
        return response

    async def resolve(self, source: str | None = None, id: str | None = None, url: str | None = None) -> ResolveResponse:
        source = (source or "").strip() or None
        id = (id or "").strip() or None
        url = (url or "").strip() or None
        if not id and not url:
            raise AppError(ErrorCode.INVALID_QUERY, "Either id or url must be provided")

        if id and not source:
            parsed = parse_public_id(id)
            if parsed:
                source, id = parsed

        id_or_url = url or id
        assert id_or_url is not None
        key = f"resolve:{source or ''}:{id_or_url}"
        cached = self.resolve_cache.get(key)
        if cached:
            return cached

        resolved = await self.manager.resolve(id_or_url=id_or_url, source=source)
        response = ResolveResponse(track=resolved.track, playback=resolved.playback)
        self.resolve_cache.set(key, response, ttl=self._resolve_ttl(response))
        return response

    async def get_album(self, source: str | None, album_id: str | None) -> AlbumInfo:
        source = (source or "").strip()
        album_id = (album_id or "").strip()
        if not source or not album_id:
            raise AppError(ErrorCode.INVALID_QUERY, "Both source and id must be provided")

        provider = self.manager.get(source)
        get_album = getattr(provider, "get_album", None)
        if provider is None or get_album is None:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, f"Provider '{source}' does not support album lookup")

        key = f"album:{source}:{album_id}"
        cached = self.album_cache.get(key)
        if cached:
            return cached

        response = await get_album(album_id)
        self.album_cache.set(key, response)
        return response

    async def get_artist(self, source: str | None, artist_id: str | None, fast: bool = False) -> ArtistInfo:
        source = (source or "").strip()
        artist_id = (artist_id or "").strip()
        if not source or not artist_id:
            raise AppError(ErrorCode.INVALID_QUERY, "Both source and id must be provided")

        # Automatically normalize source based on ID format:
        # Numeric IDs are iTunes catalog IDs; channel IDs starting with UC/MP belong to YouTube Music
        if artist_id.isdigit() and source != "itunes":
            source = "itunes"
        elif (artist_id.startswith("UC") or artist_id.startswith("MP")) and source != "youtube_music":
            source = "youtube_music"

        provider = self.manager.get(source)
        get_artist = getattr(provider, "get_artist", None)
        if provider is None or get_artist is None:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, f"Provider '{source}' does not support artist lookup")

        key = f"artist:{source}:{artist_id}"
        cached = self.artist_cache.get(key)
        if cached:
            return cached

        # «fast»: only the artist's own page (a few top songs and the first
        # albums), in about a second; the app then asks for the full one.
        if fast and "fast" in inspect.signature(get_artist).parameters:
            fast_key = f"artist-fast:{source}:{artist_id}"
            cached = self.artist_cache.get(fast_key)
            if cached:
                return cached
            response = await get_artist(artist_id, fast=True)
            self.artist_cache.set(fast_key, response)
            return response

        response = await get_artist(artist_id)
        self.artist_cache.set(key, response)
        return response

    def _resolve_ttl(self, response: ResolveResponse) -> int:
        expires_at = response.playback.expires_at
        if not expires_at:
            return self.settings.resolve_cache_ttl
        try:
            dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            return self.settings.resolve_cache_ttl
        seconds = int((dt - datetime.now(timezone.utc)).total_seconds()) - 60
        if seconds <= 0:
            return 1
        return min(self.settings.resolve_cache_ttl, seconds)
