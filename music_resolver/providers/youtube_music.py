import asyncio
import threading

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import AlbumInfo, AlbumSummary, ArtistInfo, TrackCandidate, public_track_id
from music_resolver.providers.youtube_common import (
    YtDlpResolver,
    extract_youtube_id,
    is_youtube_url,
    music_youtube_url,
)

SOURCE_NAME = "youtube_music"


def _best_thumbnail_url(thumbnails: list[dict] | None) -> str | None:
    if not thumbnails:
        return None
    try:
        return thumbnails[-1].get("url")
    except (AttributeError, IndexError):
        return None


def _artist_name_and_id(artists: list[dict] | None) -> tuple[str, str | None]:
    artists = artists or []
    name = ", ".join(a.get("name", "") for a in artists if a.get("name"))
    artist_id = None
    if artists:
        artist_id = artists[0].get("id")
    return name, artist_id


def _length_to_seconds(length: str | None) -> int | None:
    """'4:45' / '1:02:03' → seconds."""
    if not length:
        return None
    try:
        total = 0
        for part in str(length).split(":"):
            total = total * 60 + int(part)
        return total
    except ValueError:
        return None


def map_search_item(item: dict) -> TrackCandidate | None:
    """Map a single ytmusicapi search() result (filter='songs') to a TrackCandidate."""
    video_id = item.get("videoId")
    if not video_id or not extract_youtube_id(video_id):
        return None
    artist, artist_id = _artist_name_and_id(item.get("artists"))
    artwork = _best_thumbnail_url(item.get("thumbnails"))
    duration = item.get("duration_seconds")
    album = item.get("album") or {}
    return TrackCandidate(
        id=public_track_id(SOURCE_NAME, video_id),
        source=SOURCE_NAME,
        source_id=video_id,
        title=item.get("title") or "Unknown",
        artist=artist,
        duration=int(duration) if duration else None,
        artwork=artwork,
        source_url=music_youtube_url(video_id),
        album=album.get("name"),
        album_id=album.get("id"),
        artist_id=artist_id,
    )


def map_album_track(
    track: dict,
    fallback_artist: str,
    album_id: str | None,
    album_name: str | None,
    fallback_artwork: str | None = None,
) -> TrackCandidate | None:
    """Map a track entry from ytmusicapi get_album() to a TrackCandidate.

    Individual tracks inside an album/top-songs payload frequently carry no
    thumbnails of their own (only the album as a whole does), so we fall
    back to the album cover rather than leaving the track with no artwork
    at all.
    """
    video_id = track.get("videoId")
    if not video_id or not extract_youtube_id(video_id):
        return None
    artist, artist_id = _artist_name_and_id(track.get("artists"))
    artwork = _best_thumbnail_url(track.get("thumbnails")) or fallback_artwork
    duration = track.get("duration_seconds")
    return TrackCandidate(
        id=public_track_id(SOURCE_NAME, video_id),
        source=SOURCE_NAME,
        source_id=video_id,
        title=track.get("title") or "Unknown",
        artist=artist or fallback_artist,
        duration=int(duration) if duration else None,
        artwork=artwork,
        source_url=music_youtube_url(video_id),
        album=album_name,
        album_id=album_id,
        artist_id=artist_id,
    )


def map_album(album_id: str, raw: dict) -> AlbumInfo:
    """Map ytmusicapi get_album(browseId) raw dict to AlbumInfo. Never raises on missing keys."""
    artists = raw.get("artists") or []
    artist_name, artist_id = _artist_name_and_id(artists)
    title = raw.get("title") or "Unknown album"
    cover = _best_thumbnail_url(raw.get("thumbnails"))
    year = raw.get("year")
    tracks: list[TrackCandidate] = []
    for track in raw.get("tracks") or []:
        candidate = map_album_track(track, artist_name, album_id, title, fallback_artwork=cover)
        if candidate:
            tracks.append(candidate)
    return AlbumInfo(
        id=album_id,
        source=SOURCE_NAME,
        title=title,
        artist=artist_name,
        artist_id=artist_id,
        year=str(year) if year is not None else None,
        cover=cover,
        tracks=tracks,
    )


def map_artist_album_summary(entry: dict, release_type: str = "album") -> AlbumSummary | None:
    browse_id = entry.get("browseId")
    if not browse_id:
        return None
    year = entry.get("year")
    return AlbumSummary(
        id=browse_id,
        title=entry.get("title") or "Unknown album",
        year=str(year) if year is not None else None,
        cover=_best_thumbnail_url(entry.get("thumbnails")),
        type=release_type,
        source=SOURCE_NAME,
    )


def map_artist(artist_id: str, raw: dict, client=None) -> ArtistInfo:
    """Map ytmusicapi get_artist(channelId) raw dict to ArtistInfo. Never raises on missing keys.

    get_artist() itself only returns short *preview* lists for songs and
    albums (a handful of each) — that's why an artist with a large discography
    showed only ~13 tracks and was missing recent albums. When ytmusicapi
    hands back a continuation ("browseId"/"params" for the full song list or
    "params" for the full album list) and a client is given, we follow it to
    fetch everything. Any failure here just falls back to the short preview
    instead of breaking the whole artist page.
    """
    name = raw.get("name") or "Unknown artist"
    photo = _best_thumbnail_url(raw.get("thumbnails"))
    subscribers = raw.get("subscribers")

    songs = raw.get("songs") or {}
    song_entries = songs.get("results") or []
    if client is not None and songs.get("browseId"):
        try:
            full_playlist = client.get_playlist(songs["browseId"], limit=None)
            full_tracks = full_playlist.get("tracks") if isinstance(full_playlist, dict) else None
            if full_tracks:
                song_entries = full_tracks
        except Exception as exc:
            print(f"[artist:{artist_id}] full song list fetch failed, using preview: {exc}")

    top_tracks: list[TrackCandidate] = []
    for song in song_entries:
        candidate = map_album_track(song, name, None, None, fallback_artwork=photo)
        if candidate:
            top_tracks.append(candidate)

    # get_artist_albums() needs the *section's own* browseId (a separate
    # "see all albums" endpoint), not the artist's own channelId — passing
    # the wrong one used to fail silently and always fall back to the short
    # preview, which is why the discography never grew past a handful of
    # albums.
    album_section = raw.get("albums") or {}
    album_entries = album_section.get("results") or []
    print(
        f"[artist:{artist_id}] albums section: preview={len(album_entries)} "
        f"browseId={album_section.get('browseId')!r} params={'yes' if album_section.get('params') else 'no'}"
    )
    if client is not None and album_section.get("params"):
        try:
            full_albums = client.get_artist_albums(
                album_section.get("browseId") or artist_id, album_section["params"]
            )
            print(f"[artist:{artist_id}] full album fetch returned {len(full_albums or [])} entries")
            if full_albums:
                album_entries = full_albums
        except Exception as exc:
            print(f"[artist:{artist_id}] full album list fetch failed, using preview: {exc}")
    print(
        f"[artist:{artist_id}] album_entries titles: "
        + ", ".join(f"{e.get('title')!r}({e.get('year')})" for e in album_entries)
    )

    # "singles" (EPs/singles the artist released) come back the same shape
    # as "albums" but in a separate section — merge them in too, since from
    # a listener's perspective they belong on the same shelf.
    singles_section = raw.get("singles") or {}
    single_entries = singles_section.get("results") or []
    print(
        f"[artist:{artist_id}] singles section: preview={len(single_entries)} "
        f"browseId={singles_section.get('browseId')!r} params={'yes' if singles_section.get('params') else 'no'}"
    )
    if client is not None and singles_section.get("params"):
        try:
            full_singles = client.get_artist_albums(
                singles_section.get("browseId") or artist_id, singles_section["params"]
            )
            print(f"[artist:{artist_id}] full singles fetch returned {len(full_singles or [])} entries")
            if full_singles:
                single_entries = full_singles
        except Exception as exc:
            print(f"[artist:{artist_id}] full singles list fetch failed, using preview: {exc}")
    print(
        f"[artist:{artist_id}] single_entries titles: "
        + ", ".join(f"{e.get('title')!r}({e.get('year')})" for e in single_entries)
    )

    # For some (usually major-label / "verified") artist channels, YouTube
    # Music's own artist page just doesn't expose a full discography at
    # all — the "albums" shelf has no "see more" link (checked above) *and*
    # the preview + full singles list still miss real releases (confirmed
    # by hand for a few artists). A plain search for "<artist> — Albums" is
    # a completely different YouTube Music endpoint and in practice turns
    # up releases the artist-page shelves don't, so use it to fill any
    # gaps rather than relying on the artist page alone.
    # Note: ytmusicapi's search() only accepts filter="albums" here (there
    # is no separate "singles" filter — a "singles" search attempt errors
    # out with "Invalid filter provided"). The "albums" filter's results
    # still carry each release's own type ("Album", "EP", "Single"), which
    # is what we use to sort it onto the right shelf below.
    search_entries: list[tuple[dict, str]] = []
    if client is not None and name:
        try:
            hits = client.search(name, filter="albums", limit=50) or []
        except Exception as exc:
            print(f"[artist:{artist_id}] search fallback (albums) failed: {exc}")
            hits = []
        matched = [
            h
            for h in hits
            if any((a.get("id") == artist_id or a.get("name") == name) for a in (h.get("artists") or []))
        ]
        print(
            f"[artist:{artist_id}] search fallback (albums): {len(hits)} hits, {len(matched)} matched artist: "
            + ", ".join(f"{h.get('title')!r}({h.get('year')},{h.get('type')})" for h in matched)
        )
        search_entries.extend(
            (h, "single" if (h.get("type") or "").lower() in {"single", "ep"} else "album") for h in matched
        )

    albums: list[AlbumSummary] = []
    seen_album_ids: set[str] = set()
    tagged_entries = (
        [(e, "album") for e in album_entries] + [(e, "single") for e in single_entries] + search_entries
    )
    for entry, release_type in tagged_entries:
        summary = map_artist_album_summary(entry, release_type)
        if summary and summary.id not in seen_album_ids:
            seen_album_ids.add(summary.id)
            albums.append(summary)
    # Newest release first within each shelf (albums vs. singles/EPs) —
    # ytmusicapi's own ordering is by relevance, not chronological.
    albums.sort(key=lambda a: a.year or "0", reverse=True)

    return ArtistInfo(
        id=artist_id,
        source=SOURCE_NAME,
        name=name,
        photo=photo,
        subscribers=str(subscribers) if subscribers else None,
        top_tracks=top_tracks,
        albums=albums,
    )


class YoutubeMusicProvider:
    name = SOURCE_NAME

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._resolver = YtDlpResolver(settings, self.name)
        self._ytmusic = None
        self._lock = threading.Lock()
        self._catalog_provider = None  # set via set_catalog_provider(), optional

    def set_catalog_provider(self, catalog_provider) -> None:
        """Wire in a catalog provider (currently ITunesCatalogProvider) to
        use for an artist's *discography* (see get_artist below) — YouTube
        Music's own artist pages are unreliable for this (see map_artist's
        docstring), the catalog provider's data is much more complete and
        playback still ends up going through this same provider either
        way."""
        self._catalog_provider = catalog_provider

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        return await asyncio.to_thread(self._search_sync, query, limit)

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
                # Hard deadline so a misbehaving catalog source can never
                # hang the page — worst case it just falls back to
                # YouTube's own (possibly incomplete) album list.
                catalog_albums = await asyncio.wait_for(catalog.albums_for_artist_name(info.name), timeout=8.0)
                if catalog_albums:
                    info = info.model_copy(update={"albums": catalog_albums})
            except asyncio.TimeoutError:
                print(f"[artist:{artist_id}] catalog discography lookup timed out (>8s), keeping YouTube data")
            except Exception as exc:
                print(f"[artist:{artist_id}] catalog discography lookup failed, keeping YouTube data: {exc}")
        return info

    async def radio(self, video_id: str, limit: int) -> list[TrackCandidate]:
        """Tracks YouTube Music's own radio would play after this one —
        the basis for «Мой микс» (see /radio)."""
        return await asyncio.to_thread(self._radio_sync, video_id, limit)

    def _radio_sync(self, video_id: str, limit: int) -> list[TrackCandidate]:
        raw = self._client().get_watch_playlist(videoId=video_id, radio=True, limit=limit)
        results: list[TrackCandidate] = []
        for item in (raw or {}).get("tracks") or []:
            # user uploads / fan edits make a poor mix — keep real songs and official videos
            if item.get("videoType") == "MUSIC_VIDEO_TYPE_UGC":
                continue
            vid = item.get("videoId")
            if not vid or not extract_youtube_id(vid):
                continue
            artist, artist_id = _artist_name_and_id(item.get("artists"))
            album = item.get("album") or {}
            results.append(
                TrackCandidate(
                    id=public_track_id(SOURCE_NAME, vid),
                    source=SOURCE_NAME,
                    source_id=vid,
                    title=item.get("title") or "Unknown",
                    artist=artist,
                    duration=_length_to_seconds(item.get("length")),
                    artwork=_best_thumbnail_url(item.get("thumbnail")),
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
                        # requests-style proxy map, not a bare URL string —
                        # ytmusicapi hands this straight to requests.Session.
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
