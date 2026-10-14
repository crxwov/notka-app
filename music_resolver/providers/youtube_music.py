from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout, as_completed
import re
import time
import random
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
# videoType values YouTube Music gives to uploads it credits to the artist
OFFICIAL_VIDEO_TYPES = {"MUSIC_VIDEO_TYPE_OMV", "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC", "MUSIC_VIDEO_TYPE_ATV"}


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


_FAN_REMAKE_PATTERNS = re.compile(
    r"\b(?:slowed|reverb|sped\s+up|speed\s+up|nightcore|type\s+beat|beat|beatz|remake|"
    r"reproduced|re-produced|re-recorded|flip|fan\s+edit|fan\s+made|fan\s+version|"
    r"rework|mashup|bass\s+boosted|8d\s+audio|chopped\s+(?:and|&)\s+screwed|ai\s+cover|"
    r"ai\s+vocal|leak|unreleased|snippet|instrumental\s+remake|tribute|bootleg)\b"
    r"|\bprod\.?\s+[a-z0-9_]+|\bprod\s+by\b",
    re.IGNORECASE,
)


def _is_fan_remake(candidate: TrackCandidate, query: str) -> bool:
    q_lower = query.lower()
    haystack = f"{candidate.title} {candidate.artist}".lower()
    match = _FAN_REMAKE_PATTERNS.search(haystack)
    if not match:
        return False
    term = match.group(0).lower().strip()
    return term not in q_lower


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


class _RetryingClient:
    """YTMusic with quick retries.

    From a datacenter address Google now and then answers a request with a
    «Sorry…» page (HTTP 403) after a 8-10 s pause; the next request goes
    through in half a second. So every call has a short timeout (set on the
    session) and a transient failure is simply repeated, instead of the
    listener waiting ten seconds and getting SoundCloud results without
    albums or artists.
    """

    def __init__(self, inner, attempts: int = 3):
        self._inner = inner
        self._attempts = attempts

    @staticmethod
    def _transient(exc: Exception) -> bool:
        import requests

        return isinstance(exc, (ValueError, requests.exceptions.RequestException))

    def __getattr__(self, name):
        attr = getattr(self._inner, name)
        if name.startswith("_") or not callable(attr):
            return attr

        def call(*args, **kwargs):
            last: Exception | None = None
            for attempt in range(self._attempts):
                try:
                    return attr(*args, **kwargs)
                except Exception as exc:  # noqa: BLE001
                    last = exc
                    if not self._transient(exc) or attempt == self._attempts - 1:
                        raise
                    time.sleep(0.15 * (attempt + 1))
            raise last  # pragma: no cover

        return call


class _RouteClient:
    """The server's own address first, the proxy only when that fails.

    YouTube Music treats the shared proxy address as a region where the big labels' releases are
    closed: a search through it returns the fan remakes and remixes of «Espresso» or «Not Like Us»
    and not the songs themselves (measured: 4 of 8 official tracks in the top three, against 8 of 8
    straight from the server). From the server's own address the whole catalog is there. The proxy
    stays as the way out when the direct request fails, or a search comes back empty.
    """

    PAUSE = 120.0  # seconds the proxy goes first after the direct route failed

    def __init__(self, direct, make_proxy):
        self._direct = direct
        self._make_proxy = make_proxy
        self._proxy = None
        self._proxy_key = None
        self._direct_bad_until = 0.0

    def _proxy_client(self):
        address = self._make_proxy.__self__.settings.ytmusic_proxy
        if not address:
            return None
        if self._proxy is None or self._proxy_key != address:
            self._proxy = self._make_proxy(address)
            self._proxy_key = address
        return self._proxy

    def __getattr__(self, name):
        attr = getattr(self._direct, name)
        if name.startswith("_") or not callable(attr):
            return attr

        def call(*args, **kwargs):
            error: Exception | None = None
            empty = None
            if time.time() >= self._direct_bad_until:
                try:
                    result = attr(*args, **kwargs)
                    if not (name == "search" and not result):
                        return result
                    empty = result  # nothing found: the other route is asked as well
                except Exception as exc:  # noqa: BLE001
                    error = exc
                    self._direct_bad_until = time.time() + self.PAUSE
            proxy = self._proxy_client()
            if proxy is None:
                if error is not None:
                    raise error
                return empty
            try:
                return getattr(proxy, name)(*args, **kwargs)
            except Exception:  # noqa: BLE001
                if error is not None:
                    raise error
                if empty is not None:
                    return empty
                raise

        return call


ARTIST_SONGS_LIMIT = 60
YTM_REQUEST_TIMEOUT = 4.0  # seconds for one request to YouTube Music
ARTIST_FETCH_DEADLINE = 7.0  # seconds for all side requests of an artist page together


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
    album_section = raw.get("albums") or {}
    singles_section = raw.get("singles") or {}

    # Four independent YouTube requests (the full song list, the full album
    # list, the full singles list and the albums search) used to run one
    # after another and took ~18 s on a cold artist. They do not depend on
    # each other, so they run side by side now; each one that fails just
    # leaves its preview in place. The song list is capped: the page shows
    # the top tracks, not a whole 300-track catalogue.
    jobs: dict = {}
    if client is not None:
        if songs.get("browseId"):
            jobs["songs"] = lambda: client.get_playlist(songs["browseId"], limit=ARTIST_SONGS_LIMIT)
        if album_section.get("params"):
            jobs["albums"] = lambda: client.get_artist_albums(
                album_section.get("browseId") or artist_id, album_section["params"]
            )
        if singles_section.get("params"):
            jobs["singles"] = lambda: client.get_artist_albums(
                singles_section.get("browseId") or artist_id, singles_section["params"]
            )
        if name:
            jobs["search"] = lambda: client.search(name, filter="albums", limit=50)
    fetched: dict = {}
    if jobs:
        # YouTube sometimes answers a datacenter address with junk and each
        # such request then takes 5-8 s to give up. One shared deadline: what
        # has not arrived by then is dropped (the preview stays) and the
        # page opens instead of waiting for the slowest request.
        pool = ThreadPoolExecutor(max_workers=len(jobs))
        futures = {pool.submit(fn): key for key, fn in jobs.items()}
        try:
            for future in as_completed(futures, timeout=ARTIST_FETCH_DEADLINE):
                key = futures[future]
                try:
                    fetched[key] = future.result()
                except Exception as exc:
                    print(f"[artist:{artist_id}] {key} fetch failed, using preview: {exc}")
        except FuturesTimeout:
            late = [futures[f] for f in futures if not f.done()]
            print(f"[artist:{artist_id}] {', '.join(late)} not ready in {ARTIST_FETCH_DEADLINE}s, using preview")
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

    full_playlist = fetched.get("songs")
    full_tracks = full_playlist.get("tracks") if isinstance(full_playlist, dict) else None
    if full_tracks:
        song_entries = full_tracks

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
    album_entries = album_section.get("results") or []
    full_albums = fetched.get("albums")
    if full_albums:
        album_entries = full_albums

    # "singles" (EPs/singles the artist released) come back the same shape
    # as "albums" but in a separate section — merge them in too, since from
    # a listener's perspective they belong on the same shelf.
    single_entries = singles_section.get("results") or []
    full_singles = fetched.get("singles")
    if full_singles:
        single_entries = full_singles

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
        hits = fetched.get("search") or []
        matched = [
            h
            for h in hits
            if any((a.get("id") == artist_id or a.get("name") == name) for a in (h.get("artists") or []))
        ]
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


# «Микс под настроение»: our keys -> the category on YouTube Music's
# "Moods & genres" page whose playlists the mix is made of.
MOODS = {
    "energize": "Energize",
    "chill": "Chill",
    "focus": "Focus",
    "sad": "Sad",
    "party": "Party",
    "sleep": "Sleep",
    "workout": "Workout",
    "romance": "Romance",
    "ru_pop": "Russian pop",
    "ru_rock": "Russian rock",
    "ru_hiphop": "Russian hip-hop",
}
# the same moods among Russian music: found by search, since YouTube
# Music's mood pages are made of the world's playlists
RU_MOOD_QUERIES = {
    "energize": "бодрая русская музыка",
    "chill": "спокойная русская музыка",
    "focus": "музыка для работы и учёбы",
    "sad": "грустные русские песни",
    "party": "русские хиты для вечеринки",
    "sleep": "музыка для сна",
    "workout": "музыка для тренировок",
    "romance": "русские песни о любви",
}
GENRE_QUERIES = {
    "ru_pop": "русская поп музыка хиты",
    "ru_rock": "русский рок хиты",
    "ru_hiphop": "русский хип-хоп хиты",
}
_OTHER_SCENES = re.compile(
    r"bollywood|hindi|punjabi|tamil|telugu|desi|bhakti|devotional|malayalam|kannada|marathi|bengali|bhojpuri|haryanvi"
    r"|k-?pop|j-?pop|mandopop|cantopop|c-?pop|thai|viet|indones|opm|pinoy"
    r"|latin|reggaet|mexican|corridos|banda|sertanejo|brasil|samba|pagode|forr|cumbia|bachata|salsa|urbano"
    r"|arab|khaleeji|t[uü]rk|afro|amapiano|naija|country|christian|gospel|worship|kids|children|schlager",
    re.IGNORECASE,
)

class YoutubeMusicProvider:
    name = SOURCE_NAME

    def __init__(self, settings: Settings) -> None:
        self._mood_cache: dict = {}
        self.settings = settings
        self._resolver = YtDlpResolver(settings, self.name)
        self._ytmusic = None
        self._lock = threading.Lock()
        self._catalog_provider = None  # set via set_catalog_provider(), optional
        from music_resolver.services.proxy_guard import proxy_guard

        proxy_guard.on_switch.append(self._proxy_switched)

    def _proxy_switched(self, field: str) -> None:
        """The proxy died or came back: the client is built with the proxy
        baked in, so it has to be built again."""
        if field == "ytmusic_proxy" and self.settings.ytmusic_proxy != getattr(self, "_built_proxy", object()):
            with self._lock:
                self._ytmusic = None

    def set_catalog_provider(self, catalog_provider) -> None:
        """Wire in a catalog provider (currently ITunesCatalogProvider) to
        use for an artist's *discography* (see get_artist below) — YouTube
        Music's own artist pages are unreliable for this (see map_artist's
        docstring), the catalog provider's data is much more complete and
        playback still ends up going through this same provider either
        way."""
        self._catalog_provider = catalog_provider

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        # From a Russian IP the "songs" catalog simply has no major-label
        # releases after 2022 — only covers and karaoke come back for them.
        # The same tracks do exist as videos YouTube Music itself credits to
        # the real artist, so those are searched alongside and merged in.
        songs, videos = await asyncio.gather(
            self.search_songs(query, limit),
            self.search_videos(query, 10),
            return_exceptions=True,
        )
        if isinstance(songs, BaseException):
            raise songs
        if isinstance(videos, BaseException):
            videos = []
        clean_songs = [c for c in songs if not _is_fan_remake(c, query)]
        merged = clean_songs if clean_songs else list(songs)
        seen_ids = {c.source_id for c in merged}
        seen_names = {(c.title.strip().lower(), c.artist.strip().lower()) for c in merged}
        for candidate, video_type in videos:
            name = (candidate.title.strip().lower(), candidate.artist.strip().lower())
            if (
                video_type not in OFFICIAL_VIDEO_TYPES
                or _is_fan_remake(candidate, query)
                or candidate.source_id in seen_ids
                or name in seen_names
            ):
                continue
            seen_ids.add(candidate.source_id)
            seen_names.add(name)
            merged.append(candidate)
        return merged

    async def search_songs(self, query: str, limit: int) -> list[TrackCandidate]:
        """The catalog proper ("songs" only) — what track matching trusts first."""
        return await asyncio.to_thread(self._search_sync, query, limit)

    async def search_videos(self, query: str, limit: int) -> list[tuple[TrackCandidate, str]]:
        """Video results with YouTube Music's own type for each: an official
        upload (OFFICIAL_VIDEO_TYPES) or a user upload (…_UGC)."""
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

    async def get_artist(self, artist_id: str, fast: bool = False) -> ArtistInfo:
        info = await asyncio.to_thread(self._get_artist_sync, artist_id, fast)
        if fast:
            return info
        catalog = self._catalog_provider
        if catalog is not None and getattr(catalog, "configured", False):
            try:
                # Hard deadline so a misbehaving catalog source can never
                # hang the page — worst case it just falls back to
                # YouTube's own (possibly incomplete) album list.
                catalog_albums = await asyncio.wait_for(catalog.albums_for_artist_name(info.name), timeout=4.0)
                if catalog_albums:
                    info = info.model_copy(update={"albums": catalog_albums})
            except asyncio.TimeoutError:
                print(f"[artist:{artist_id}] catalog discography lookup timed out (>4s), keeping YouTube data")
            except Exception as exc:
                print(f"[artist:{artist_id}] catalog discography lookup failed, keeping YouTube data: {exc}")
        return info

    async def find_artist_id(self, name: str) -> str | None:
        """The channel id of the artist with exactly this name, if there is one."""
        return await asyncio.to_thread(self._find_artist_id_sync, name)

    def _find_artist_id_sync(self, name: str) -> str | None:
        wanted = name.strip().lower()
        for item in self._client().search(name, filter="artists", limit=5) or []:
            if (item.get("artist") or "").strip().lower() == wanted and item.get("browseId"):
                return item["browseId"]
        return None

    async def search_artists(self, query: str, limit: int) -> list[dict]:
        """Artists matching the query, each with its photo — for the search screen."""
        return await asyncio.to_thread(self._search_artists_sync, query, limit)

    def _search_artists_sync(self, query: str, limit: int) -> list[dict]:
        found: list[dict] = []
        # While a name is still being typed («тревис ск») the search finds
        # nobody; the words typed so far («тревис») find the artist, and
        # the app picks the one the whole query fits.
        words = query.split()
        attempts = [query] + [" ".join(words[:n]) for n in range(len(words) - 1, 0, -1)]
        for attempt in attempts:
            for item in self._client().search(attempt, filter="artists", limit=limit) or []:
                name = (item.get("artist") or "").strip()
                browse_id = item.get("browseId")
                if not name or not browse_id:
                    continue
                found.append(
                    {
                        "id": browse_id,
                        "source": "youtube_music",
                        "name": name,
                        "photo": _best_thumbnail_url(item.get("thumbnails")),
                    }
                )
            if found:
                break
        return found[:limit]

    async def mood_tracks(
        self, key: str, limit: int, artists: list[str] | None = None, ru_share: float | None = None
    ) -> list[TrackCandidate]:
        """A mix for a mood or a genre (see MOODS), fitted to the listener:
        ``artists`` are the ones they listen to, ``ru_share`` — how much of
        their music is in Russian (0..1)."""
        return await asyncio.to_thread(self._mood_tracks_sync, key, limit, artists or [], ru_share)

    def _mood_playlists(self, key: str) -> tuple[list[str], list[str]]:
        """Playlist ids for a mood: (the world's, Russian ones). Cached for hours."""
        client = self._client()
        now = time.time()
        cached = self._mood_cache.get(key)
        if cached and now - cached[0] < 6 * 3600:
            return cached[1], cached[2]

        def by_search(query: str) -> list[str]:
            found = client.search(query, filter="playlists", limit=12) or []
            return [i for i in ((item.get("browseId") or "").removeprefix("VL") for item in found) if i]

        if key in GENRE_QUERIES:
            # the genre pages hold songs next to playlists, which
            # ytmusicapi's parser can't read — so they are found by search
            world, russian = [], by_search(GENRE_QUERIES[key])
        else:
            # YouTube Music's own "Moods & genres" page: the list of
            # categories changes rarely, the playlists in one — more often
            if now - self._mood_cache.get("categories_at", 0) > 86400:
                categories = {}
                for items in (client.get_mood_categories() or {}).values():
                    for item in items:
                        categories[(item.get("title") or "").lower()] = item.get("params")
                self._mood_cache["categories"] = categories
                self._mood_cache["categories_at"] = now
            params = self._mood_cache["categories"].get(MOODS[key].lower())
            # a mood's page mixes in playlists for other countries' scenes
            # (Bollywood, Turkish pop, K-Pop…); those are left out
            world = [
                item["playlistId"]
                for item in (client.get_mood_playlists(params) if params else []) or []
                if item.get("playlistId") and not _OTHER_SCENES.search(item.get("title") or "")
            ]
            try:
                russian = by_search(RU_MOOD_QUERIES[key])
            except Exception:
                russian = []
        self._mood_cache[key] = (now, world, russian)
        return world, russian

    def _mood_pool_sync(self, key: str, ru_share: float | None) -> list[TrackCandidate]:
        """Tracks from a few of the mood's playlists, shuffled, no repeats."""
        return self._mood_candidates(key, ru_share)

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

        # the listener's own artists come first…
        known = {name.strip().lower() for name in artists if name and name.strip()}
        def by_known_artist(track: TrackCandidate) -> bool:
            return any(part.strip().lower() in known for part in re.split(r",|&| feat\.? ", track.artist))
        theirs = [t for t in candidates if by_known_artist(t)] if known else []
        others = [t for t in candidates if t not in theirs]

        # …and from two of those, what YouTube Music would play next
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
        if theirs:  # it opens with an artist the listener knows
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

        # how many playlists of each kind: by how much Russian the listener
        # has in their own music (half and half when that isn't known)
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

    async def radio(self, video_id: str, limit: int, known_artists: list[str] | None = None) -> list[TrackCandidate]:
        """Tracks YouTube Music's own radio would play after this one —
        the basis for «Мой микс» (see /radio)."""
        return await asyncio.to_thread(self._radio_sync, video_id, limit, known_artists)

    def _radio_sync(self, video_id: str, limit: int, known_artists: list[str] | None = None) -> list[TrackCandidate]:
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
        # the mix's own gate: no covers, nursery rhymes or unknown channels (see services/mix_quality.py)
        from music_resolver.services import mix_quality

        try:
            results = mix_quality.filter_tracks(self._client(), results, set(known_artists or []))
        except Exception:  # noqa: BLE001 - a failing gate must not empty the mix
            pass
        return results[:limit]

    def can_handle_url(self, url: str) -> bool:
        return is_youtube_url(url)

    def _make_proxy_client(self, address: str):
        return self._build_ytmusic(address)

    def _client(self):
        if self._ytmusic is None:
            with self._lock:
                if self._ytmusic is None:
                    from ytmusicapi import YTMusic

                    import functools

                    import requests

                    def build(proxy_address: str | None):
                        kwargs: dict = {}
                        if proxy_address:
                            # requests-style proxy map, not a bare URL string —
                            # ytmusicapi hands this straight to requests.Session.
                            kwargs["proxies"] = {"http": proxy_address, "https": proxy_address}
                        kwargs["location"] = self.settings.ytmusic_location or "US"
                        # a short timeout: a good answer takes under a second, a
                        # throttled one hangs for ten — better to ask again
                        session = requests.Session()
                        session.request = functools.partial(session.request, timeout=YTM_REQUEST_TIMEOUT)  # type: ignore[method-assign]
                        kwargs["requests_session"] = session
                        return _RetryingClient(YTMusic(**kwargs))

                    self._build_ytmusic = build
                    self._built_proxy = self.settings.ytmusic_proxy
                    # direct first, the proxy (if there is one and it is alive) only as the way out
                    self._ytmusic = _RouteClient(build(None), self._make_proxy_client)
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

    def _get_artist_sync(self, artist_id: str, fast: bool = False) -> ArtistInfo:
        client = self._client()
        try:
            raw = client.get_artist(artist_id)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Failed to load artist from YouTube Music") from exc
        if not raw:
            raise AppError(ErrorCode.ARTIST_NOT_FOUND, "Artist was not found")
        try:
            return map_artist(artist_id, raw, client=None if fast else client)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Failed to parse artist metadata") from exc
