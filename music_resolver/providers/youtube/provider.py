import asyncio
import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import AlbumInfo, ArtistInfo, TrackCandidate, public_track_id
from music_resolver.providers.youtube_common import (
    YtDlpResolver,
    extract_youtube_id,
    is_youtube_url,
    music_youtube_url,
)
from music_resolver.providers.youtube.mappers import (
    SOURCE_NAME,
    artist_name_and_id,
    best_thumbnail_url,
    length_to_seconds,
    map_album,
    map_album_track,
    map_artist,
    map_search_item,
)
from music_resolver.providers.youtube.moods import (
    GENRE_QUERIES,
    MOODS,
    OTHER_SCENES,
    RU_MOOD_QUERIES,
)

OFFICIAL_VIDEO_TYPES = {"MUSIC_VIDEO_TYPE_OMV", "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC"}


class YouTubeMusicProvider:
    name = SOURCE_NAME

    def __init__(self, settings: Settings) -> None:
        self._mood_cache: dict = {}
        self.settings = settings
        self._resolver = YtDlpResolver(settings, self.name)
        self._ytmusic = None
        self._lock = threading.Lock()
        self._catalog_provider = None

    def set_catalog_provider(self, catalog_provider) -> None:
        self._catalog_provider = catalog_provider

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        songs, videos = await asyncio.gather(
            self.search_songs(query, limit),
            self.search_videos(query, 10),
            return_exceptions=True,
        )
        if isinstance(songs, BaseException):
            raise songs
        if isinstance(videos, BaseException):
            videos = []
        seen_ids = {c.source_id for c in songs}
        seen_names = {(c.title.strip().lower(), c.artist.strip().lower()) for c in songs}
        merged = list(songs)
        for candidate, video_type in videos:
            name = (candidate.title.strip().lower(), candidate.artist.strip().lower())
            if video_type not in OFFICIAL_VIDEO_TYPES or candidate.source_id in seen_ids or name in seen_names:
                continue
            seen_ids.add(candidate.source_id)
            seen_names.add(name)
            merged.append(candidate)
        return merged

    async def search_songs(self, query: str, limit: int) -> list[TrackCandidate]:
        return await asyncio.to_thread(self._search_sync, query, limit)

    async def search_videos(self, query: str, limit: int) -> list[tuple[TrackCandidate, str]]:
        return await asyncio.to_thread(self._search_videos_sync, query, limit)

    def _search_videos_sync(self, query: str, limit: int) -> list[tuple[TrackCandidate, str]]:
        raw = self._client().search(query, filter="videos", limit=limit)
        results: list[tuple[TrackCandidate, str]] = []
        for item in raw or []:
            candidate = map_search_item(item)
            if candidate:
                results.append((candidate, item.get("videoType") or ""))
        return results

    async def resolve(self, id_or_url: str):
        return await self._resolver.resolve(id_or_url)

    async def download_to_file(self, id_or_url: str, dest_dir, dest_stem: str):
        return await self._resolver.download_to_file(id_or_url, dest_dir, dest_stem)

    async def get_album(self, album_id: str) -> AlbumInfo:
        return await asyncio.to_thread(self._get_album_sync, album_id)

    async def get_artist(self, artist_id: str) -> ArtistInfo:
        info = await asyncio.to_thread(self._get_artist_sync, artist_id)
        catalog = self._catalog_provider
        if catalog is not None and getattr(catalog, "configured", False):
            try:
                catalog_albums = await asyncio.wait_for(catalog.albums_for_artist_name(info.name), timeout=8.0)
                if catalog_albums:
                    info = info.model_copy(update={"albums": catalog_albums})
            except asyncio.TimeoutError:
                print(f"[artist:{artist_id}] catalog discography lookup timed out (>8s), keeping YouTube data")
            except Exception as exc:
                print(f"[artist:{artist_id}] catalog discography lookup failed, keeping YouTube data: {exc}")
        return info

    async def find_artist_id(self, name: str) -> str | None:
        return await asyncio.to_thread(self._find_artist_id_sync, name)

    def _find_artist_id_sync(self, name: str) -> str | None:
        wanted = name.strip().lower()
        for item in self._client().search(name, filter="artists", limit=5) or []:
            if (item.get("artist") or "").strip().lower() == wanted and item.get("browseId"):
                return item["browseId"]
        return None

    async def search_artists(self, query: str, limit: int) -> list[dict]:
        return await asyncio.to_thread(self._search_artists_sync, query, limit)

    def _search_artists_sync(self, query: str, limit: int) -> list[dict]:
        found: list[dict] = []
        for item in self._client().search(query, filter="artists", limit=limit) or []:
            name = (item.get("artist") or "").strip()
            browse_id = item.get("browseId")
            if not name or not browse_id:
                continue
            found.append(
                {
                    "id": browse_id,
                    "source": "youtube_music",
                    "name": name,
                    "photo": best_thumbnail_url(item.get("thumbnails")),
                }
            )
        return found[:limit]

    async def mood_tracks(
        self, key: str, limit: int, artists: list[str] | None = None, ru_share: float | None = None
    ) -> list[TrackCandidate]:
        return await asyncio.to_thread(self._mood_tracks_sync, key, limit, artists or [], ru_share)

    def _mood_playlists(self, key: str) -> tuple[list[str], list[str]]:
        client = self._client()
        now = time.time()
        cached = self._mood_cache.get(key)
        if cached and now - cached[0] < 6 * 3600:
            return cached[1], cached[2]

        def by_search(query: str) -> list[str]:
            found = client.search(query, filter="playlists", limit=12) or []
            return [i for i in ((item.get("browseId") or "").removeprefix("VL") for item in found) if i]

        if key in GENRE_QUERIES:
            world, russian = [], by_search(GENRE_QUERIES[key])
        else:
            if now - self._mood_cache.get("categories_at", 0) > 86400:
                categories = {}
                for items in (client.get_mood_categories() or {}).values():
                    for item in items:
                        categories[(item.get("title") or "").lower()] = item.get("params")
                self._mood_cache["categories"] = categories
                self._mood_cache["categories_at"] = now
            params = self._mood_cache["categories"].get(MOODS[key].lower())
            world = [
                item["playlistId"]
                for item in (client.get_mood_playlists(params) if params else []) or []
                if item.get("playlistId") and not OTHER_SCENES.search(item.get("title") or "")
            ]
            try:
                russian = by_search(RU_MOOD_QUERIES[key])
            except Exception:
                russian = []
        self._mood_cache[key] = (now, world, russian)
        return world, russian

    def _mood_tracks_sync(self, key: str, limit: int, artists: list[str], ru_share: float | None) -> list[TrackCandidate]:
        if key not in MOODS:
            raise AppError(ErrorCode.INVALID_QUERY, "Unknown mood")
        candidates = self._mood_candidates(key, ru_share)
        seen = {t.id for t in candidates} | {f"{t.title.lower()}|{t.artist.lower()}" for t in candidates}

        def fresh(track: TrackCandidate) -> bool:
            same_song = f"{track.title.lower()}|{track.artist.lower()}"
            if track.id in seen or same_song in seen:
                return False
            seen.update((track.id, same_song))
            return True

        known = {name.strip().lower() for name in artists if name and name.strip()}
        def by_known_artist(track: TrackCandidate) -> bool:
            return any(part.strip().lower() in known for part in re.split(r",|&| feat\.? ", track.artist))
        theirs = [t for t in candidates if by_known_artist(t)] if known else []
        others = [t for t in candidates if t not in theirs]

        def radio_of(track: TrackCandidate) -> list[TrackCandidate]:
            try:
                return self._radio_sync(track.source_id, 20)
            except Exception:
                return []
        near: list[TrackCandidate] = []
        if theirs:
            with ThreadPoolExecutor(max_workers=2) as pool:
                for tracks in pool.map(radio_of, theirs[:2]):
                    near.extend(t for t in tracks if fresh(t))

        head = theirs[:12] + near[:16]
        random.shuffle(head)
        if theirs:
            head.remove(theirs[0])
            head.insert(0, theirs[0])
        return (head + others)[:limit]

    def _mood_candidates(self, key: str, ru_share: float | None) -> list[TrackCandidate]:
        if key not in MOODS:
            raise AppError(ErrorCode.INVALID_QUERY, "Unknown mood")
        client = self._client()
        world, russian = self._mood_playlists(key)
        if not world and not russian:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "This mood is not available right now")

        total = 4
        share = 0.5 if ru_share is None else min(0.85, max(0.15, ru_share))
        ru_count = min(len(russian), round(total * share)) if world else min(len(russian), total)
        picked = random.sample(russian, ru_count) + random.sample(world, min(len(world), total - ru_count))

        def read_playlist(playlist_id: str) -> list[TrackCandidate]:
            try:
                raw = client.get_playlist(playlist_id, limit=40)
            except Exception:
                return []
            out = []
            for entry in raw.get("tracks") or []:
                album = entry.get("album") or {}
                mapped = map_album_track(entry, "", album.get("id"), album.get("name"))
                if mapped is not None:
                    out.append(mapped)
            return out

        with ThreadPoolExecutor(max_workers=4) as pool:
            pools = list(pool.map(read_playlist, picked))

        seen: set[str] = set()

        def fresh(track: TrackCandidate) -> bool:
            same_song = f"{track.title.lower()}|{track.artist.lower()}"
            if track.id in seen or same_song in seen:
                return False
            seen.update((track.id, same_song))
            return True

        candidates = [t for tracks in pools for t in tracks if fresh(t)]
        random.shuffle(candidates)
        return candidates

    async def radio(self, video_id: str, limit: int) -> list[TrackCandidate]:
        return await asyncio.to_thread(self._radio_sync, video_id, limit)

    def _radio_sync(self, video_id: str, limit: int) -> list[TrackCandidate]:
        raw = self._client().get_watch_playlist(videoId=video_id, radio=True, limit=limit)
        results: list[TrackCandidate] = []
        for item in (raw or {}).get("tracks") or []:
            if item.get("videoType") == "MUSIC_VIDEO_TYPE_UGC":
                continue
            vid = item.get("videoId")
            if not vid or not extract_youtube_id(vid):
                continue
            artist, artist_id = artist_name_and_id(item.get("artists"))
            album = item.get("album") or {}
            results.append(
                TrackCandidate(
                    id=public_track_id(SOURCE_NAME, vid),
                    source=SOURCE_NAME,
                    source_id=vid,
                    title=item.get("title") or "Unknown",
                    artist=artist,
                    duration=length_to_seconds(item.get("length")),
                    artwork=best_thumbnail_url(item.get("thumbnail")),
                    source_url=music_youtube_url(vid),
                    album=album.get("name"),
                    album_id=album.get("id"),
                    artist_id=artist_id,
                )
            )
        return results[:limit]

    def can_handle_url(self, url: str) -> bool:
        return is_youtube_url(url)

    def _client(self):
        if self._ytmusic is None:
            with self._lock:
                if self._ytmusic is None:
                    from ytmusicapi import YTMusic
                    kwargs: dict = {}
                    if self.settings.ytmusic_proxy:
                        kwargs["proxies"] = {
                            "http": self.settings.ytmusic_proxy,
                            "https": self.settings.ytmusic_proxy,
                        }
                    if self.settings.ytmusic_location:
                        kwargs["location"] = self.settings.ytmusic_location
                    self._ytmusic = YTMusic(**kwargs)
        return self._ytmusic

    def _search_sync(self, query: str, limit: int) -> list[TrackCandidate]:
        raw = self._client().search(query, filter="songs", limit=limit)
        results: list[TrackCandidate] = []
        for item in raw or []:
            candidate = map_search_item(item)
            if candidate:
                results.append(candidate)
        return results

    def _get_album_sync(self, album_id: str) -> AlbumInfo:
        try:
            raw = self._client().get_album(album_id)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Failed to load album from YouTube Music") from exc
        if not raw:
            raise AppError(ErrorCode.ALBUM_NOT_FOUND, "Album was not found")
        try:
            return map_album(album_id, raw)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Failed to parse album metadata") from exc

    def _get_artist_sync(self, artist_id: str) -> ArtistInfo:
        client = self._client()
        try:
            raw = client.get_artist(artist_id)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Failed to load artist from YouTube Music") from exc
        if not raw:
            raise AppError(ErrorCode.ARTIST_NOT_FOUND, "Artist was not found")
        try:
            return map_artist(artist_id, raw, client=client)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Failed to parse artist metadata") from exc
