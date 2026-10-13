import asyncio
import json
import re
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import httpx

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import AlbumInfo, AlbumSummary, ArtistInfo, ResolvedTrack, TrackCandidate, candidate_to_track
from music_resolver.providers.itunes.cache import load_disk_cache, save_disk_cache
from music_resolver.providers.itunes.matcher import match_among_videos, search_and_match
from music_resolver.providers.itunes.parser import SOURCE_NAME, artwork, dedupe_albums, map_track

_SEARCH_URL = "https://itunes.apple.com/search"
_LOOKUP_URL = "https://itunes.apple.com/lookup"


class ITunesCatalogProvider:
    name = SOURCE_NAME

    def __init__(self, settings: Settings, youtube_provider, youtube_fallback_provider=None) -> None:
        self.settings = settings
        self.youtube_provider = youtube_provider
        self.youtube_fallback_provider = youtube_fallback_provider
        self._last_request_at = 0.0
        self._rate_lock = asyncio.Lock()
        self._match_cache: dict[str, str] = {}
        self._track_info_cache: dict[str, TrackCandidate] = {}
        self._artist_id_cache: dict[str, str | None] = {}
        self._albums_cache: dict[str, list[dict]] = {}
        self._album_cache: dict[str, tuple[float, AlbumInfo]] = {}
        self._cache_ttl = 3600.0
        load_disk_cache(self._artist_id_cache, self._albums_cache)

    @property
    def configured(self) -> bool:
        return True

    async def _get(self, url: str, params: dict) -> dict:
        async with self._rate_lock:
            elapsed = time.monotonic() - self._last_request_at
            if elapsed < 0.34:
                await asyncio.sleep(0.34 - elapsed)
            self._last_request_at = time.monotonic()
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(
                    timeout=self.settings.provider_timeout, proxy=self.settings.itunes_proxy
                ) as client:
                    resp = await client.get(
                        url,
                        params=params,
                        headers={
                            "User-Agent": (
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                "AppleWebKit/537.36 (KHTML, like Gecko) "
                                "Chrome/128.0.0.0 Safari/537.36"
                            ),
                            "Accept": "application/json, text/javascript, */*",
                            "Referer": "https://music.apple.com/",
                            "Origin": "https://music.apple.com",
                        },
                    )
                    resp.raise_for_status()
                    return resp.json()
            except httpx.HTTPError as exc:
                last_exc = exc
                await asyncio.sleep(0.4 * (attempt + 1))
        raise AppError(ErrorCode.RESOLVE_FAILED, "iTunes request failed") from last_exc

    def _remember_artist_id(self, artist_name: str | None, artist_id) -> None:
        if not artist_name or not artist_id:
            return
        cache_key = artist_name.strip().lower()
        if cache_key and cache_key not in self._artist_id_cache:
            self._artist_id_cache[cache_key] = str(artist_id)
            save_disk_cache(self._artist_id_cache, self._albums_cache)

    async def _lookup_track_info(self, track_id: str) -> TrackCandidate:
        cached = self._track_info_cache.get(track_id)
        if cached is not None:
            return cached
        data = await self._get(_LOOKUP_URL, {"id": track_id})
        items = data.get("results") or []
        candidate = map_track(items[0]) if items else None
        if candidate is None:
            raise AppError(ErrorCode.TRACK_NOT_FOUND, "No such track in the catalog")
        self._remember_artist_id(candidate.artist, candidate.artist_id)
        self._track_info_cache[track_id] = candidate
        return candidate

    async def _matched_video(self, track_id: str) -> str:
        video_id = self._match_cache.get(track_id)
        if not video_id:
            info = await self._lookup_track_info(track_id)
            video_id = await self._match_on_youtube(info.title, info.artist, info.duration)
            self._match_cache[track_id] = video_id
        return video_id

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        data = await self._get(_SEARCH_URL, {"term": query, "entity": "song", "limit": limit})
        results = []
        for item in data.get("results") or []:
            candidate = map_track(item)
            if candidate:
                self._remember_artist_id(candidate.artist, candidate.artist_id)
                self._track_info_cache[candidate.source_id] = candidate
                results.append(candidate)
        return results

    async def resolve(self, id_or_url: str) -> ResolvedTrack:
        track_id = self._extract_track_id(id_or_url)
        if not track_id:
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Unsupported or invalid iTunes URL")
        info = await self._lookup_track_info(track_id)
        video_id = await self._matched_video(track_id)
        yt_resolved = await self.youtube_provider.resolve(video_id)
        return ResolvedTrack(track=candidate_to_track(info), playback=yt_resolved.playback)

    async def download_to_file(self, id_or_url: str, dest_dir: Path, dest_stem: str):
        track_id = self._extract_track_id(id_or_url) or id_or_url
        video_id = await self._matched_video(track_id)
        return await self.youtube_provider.download_to_file(video_id, dest_dir, dest_stem)

    def can_handle_url(self, url: str) -> bool:
        try:
            host = urlparse(url).netloc.lower()
        except ValueError:
            return False
        return host.endswith("apple.com")

    def matched_video_id(self, track_id: str) -> str | None:
        return self._match_cache.get(track_id)

    @staticmethod
    def _extract_track_id(id_or_url: str) -> str | None:
        value = (id_or_url or "").strip()
        if not value:
            return None
        if value.isdigit():
            return value
        match = re.search(r"[?&]i=(\d+)", value) or re.search(r"/id(\d+)", value)
        return match.group(1) if match else None

    async def _match_on_youtube(self, title: str, artist: str, duration: int | None = None) -> str:
        primary_artist = artist.split(",")[0].strip() if artist else artist
        primary_artist = re.split(r"\bfeat\.?\b|\bft\.?\b|&", primary_artist, flags=re.IGNORECASE)[0].strip()
        query = f"{title} {primary_artist}".strip()

        accepted, ranked = await search_and_match(self.youtube_provider, query, title, primary_artist)
        via = "catalog"
        if accepted is None:
            accepted, via = await match_among_videos(self.youtube_provider, query, title, artist, primary_artist, duration)

        print(
            f"[itunes match] query={query!r} -> "
            + (f"accepted via {via}: {accepted.title!r} by {accepted.artist!r} ({accepted.source_id})" if accepted else "NOT FOUND")
            + " (top catalog results: "
            + ", ".join(f"{c.title!r}/{c.artist!r}/{c.confidence}" for c in ranked[:5])
            + ")"
        )
        if accepted is None:
            raise AppError(ErrorCode.TRACK_NOT_FOUND, "Track not found in the official catalog")
        return accepted.source_id

    async def find_artist_id(self, name: str) -> str | None:
        if not name:
            return None
        cache_key = name.strip().lower()
        if cache_key in self._artist_id_cache:
            return self._artist_id_cache[cache_key]

        result = await self._find_artist_id_via_musicartist_search(name)
        if result is None:
            result = await self._find_artist_id_via_song_search(name)

        self._artist_id_cache[cache_key] = result
        save_disk_cache(self._artist_id_cache, self._albums_cache)
        return result

    async def _find_artist_id_via_musicartist_search(self, name: str) -> str | None:
        try:
            data = await self._get(_SEARCH_URL, {"term": name, "entity": "musicArtist", "limit": 5})
        except AppError as exc:
            print(f"[itunes] musicArtist search for {name!r} failed: {exc}")
            return None
        items = data.get("results") or []
        if not items:
            return None
        exact = [i for i in items if (i.get("artistName") or "").strip().lower() == name.strip().lower()]
        best = (exact or items)[0]
        return str(best.get("artistId")) if best.get("artistId") else None

    async def _find_artist_id_via_song_search(self, name: str) -> str | None:
        try:
            data = await self._get(_SEARCH_URL, {"term": name, "entity": "song", "attribute": "artistTerm", "limit": 25})
        except AppError as exc:
            print(f"[itunes] song-search fallback for artist {name!r} failed too: {exc}")
            return None
        items = data.get("results") or []
        name_norm = name.strip().lower()
        exact = [i for i in items if (i.get("artistName") or "").strip().lower() == name_norm]
        for item in exact or items:
            if item.get("artistId"):
                artist_id = str(item["artistId"])
                print(f"[itunes] resolved artistId for {name!r} via song-search fallback: {artist_id}")
                return artist_id
        return None

    async def albums_for_artist_name(self, name: str) -> list[AlbumSummary]:
        artist_id = await self.find_artist_id(name)
        if not artist_id:
            return []
        raw_albums = await self._fetch_all_albums(artist_id)
        return dedupe_albums(raw_albums)

    async def get_artist(self, artist_id: str) -> ArtistInfo:
        raw_albums = await self._fetch_all_albums(artist_id)
        albums = dedupe_albums(raw_albums)
        names = Counter(a.get("artistName") for a in raw_albums if a.get("artistName"))
        name = names.most_common(1)[0][0] if names else "Unknown artist"

        find_artist_id = getattr(self.youtube_provider, "find_artist_id", None)
        if find_artist_id is not None and raw_albums:
            try:
                yt_artist_id = await asyncio.wait_for(find_artist_id(name), timeout=8.0)
                if yt_artist_id:
                    return await self.youtube_provider.get_artist(yt_artist_id)
            except Exception as exc:
                print(f"[itunes] no YouTube Music page for artist {name!r}: {exc}")

        top_tracks: list[TrackCandidate] = []
        try:
            data = await self._get(_LOOKUP_URL, {"id": artist_id, "entity": "song", "limit": 50})
            for item in data.get("results") or []:
                candidate = map_track(item) if item.get("wrapperType") == "track" else None
                if candidate:
                    top_tracks.append(candidate)
        except AppError as exc:
            print(f"[itunes] top songs for artist {artist_id} failed: {exc}")

        return ArtistInfo(
            id=artist_id,
            source=SOURCE_NAME,
            name=name or "Unknown artist",
            photo=None,
            subscribers=None,
            top_tracks=top_tracks,
            albums=albums,
        )

    async def _fetch_all_albums(self, artist_id: str) -> list[dict]:
        cached = self._albums_cache.get(artist_id)
        if cached is not None:
            return cached
        data = await self._get(_LOOKUP_URL, {"id": artist_id, "entity": "album", "limit": 200})
        entries = [r for r in (data.get("results") or []) if r.get("wrapperType") == "collection"]
        self._albums_cache[artist_id] = entries
        save_disk_cache(self._artist_id_cache, self._albums_cache)
        return entries

    async def get_album(self, album_id: str) -> AlbumInfo:
        cached = self._album_cache.get(album_id)
        if cached and (time.monotonic() - cached[0]) < self._cache_ttl:
            return cached[1]

        data = await self._get(_LOOKUP_URL, {"id": album_id, "entity": "song"})
        results = data.get("results") or []
        collection = next((r for r in results if r.get("wrapperType") == "collection"), {})
        title = collection.get("collectionName") or "Unknown album"
        artist_name = collection.get("artistName") or ""
        artist_id = str(collection.get("artistId")) if collection.get("artistId") else None
        self._remember_artist_id(artist_name, collection.get("artistId"))
        cover = artwork(collection)
        release_date = collection.get("releaseDate") or ""
        year = release_date[:4] if release_date else None

        tracks: list[TrackCandidate] = []
        for item in results:
            if item.get("wrapperType") != "track":
                continue
            candidate = map_track(item, album_name=title, album_id=album_id)
            if candidate:
                if not candidate.artwork:
                    candidate = candidate.model_copy(update={"artwork": cover})
                self._track_info_cache[candidate.source_id] = candidate
                tracks.append(candidate)

        album_info = AlbumInfo(
            id=album_id,
            source=SOURCE_NAME,
            title=title,
            artist=artist_name,
            artist_id=artist_id,
            year=year,
            cover=cover,
            tracks=tracks,
        )
        self._album_cache[album_id] = (time.monotonic(), album_info)
        return album_info
