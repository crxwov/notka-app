"""MusicBrainz as a *catalog* source only.

Same role Spotify was meant to play (see the removed spotify.py): this
provider never plays audio itself — it only supplies search/album/artist
metadata. MusicBrainz is a free, open, unauthenticated database with no
subscription gate (unlike Spotify's Web API, which started requiring a
Premium subscription on the owning account even for app-only/client-
credentials access — see the console log that proved this: a 200 OK token
fetch followed by a 403 Forbidden on every actual API call). It also tends
to have very complete official discographies, including releases that
YouTube Music's own artist pages sometimes omit for certain artists.

When a track actually needs to *play*, this provider looks it up by title
+ artist against a YouTube-backed provider (passed in at construction) using
the same text-similarity matcher the search endpoint uses, and delegates
playback (resolve + the actual audio download) to that match. The track
identity shown to the rest of the app (id, source="musicbrainz", duration,
artwork, ...) stays MusicBrainz's own — only the underlying audio bytes come
from YouTube.

MusicBrainz asks anonymous clients to: (1) send a descriptive User-Agent,
and (2) stay around/under 1 request/second. Both are handled centrally in
_get().
"""

import asyncio
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import (
    AlbumInfo,
    AlbumSummary,
    ArtistInfo,
    ResolvedTrack,
    TrackCandidate,
    TrackInfo,
    public_track_id,
)
from music_resolver.services.matcher import rank_candidates

SOURCE_NAME = "musicbrainz"
_API_BASE = "https://musicbrainz.org/ws/2"
_COVER_ART_BASE = "https://coverartarchive.org"
_USER_AGENT = "Notka-TelegramMusicApp/1.0 ( https://github.com/notka-app )"

# Release-group secondary types we don't want cluttering the albums/singles
# shelves (deluxe live rereleases, remix compilations, etc.) — a Mixtape is
# deliberately kept, since a lot of hip-hop discography (JACKBOYS, for
# example) is tagged that way and users expect to see it.
_EXCLUDED_SECONDARY_TYPES = {"compilation", "live", "remix", "dj-mix", "interview", "audiobook", "spokenword"}

# Persisted to disk (not just kept in memory) because during development the
# server gets restarted constantly, and MusicBrainz's free search cluster is
# noticeably flaky (routine 503s under its own load) — without this, every
# restart forces a full, slow, retry-prone re-fetch of every artist you'd
# already looked up minutes earlier. Same benefit for real usage: an
# artist's discography barely ever changes, so paying the cost once (ever,
# not just once an hour) is the right trade-off.
_DISK_CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "cache" / "musicbrainz_catalog.json"


def _artist_credit_names(artist_credit: list[dict] | None) -> str:
    if not artist_credit:
        return ""
    parts = []
    for entry in artist_credit:
        name = entry.get("name") or (entry.get("artist") or {}).get("name")
        if name:
            parts.append(name)
    return ", ".join(parts)


def _duration_seconds(length_ms) -> int | None:
    return int(length_ms / 1000) if length_ms else None


class MusicBrainzProvider:
    """Duck-types enough of MusicProvider to slot into ProviderManager, plus
    get_album/get_artist/download_to_file like the YouTube providers."""

    name = SOURCE_NAME

    def __init__(self, settings: Settings, youtube_provider) -> None:
        self.settings = settings
        self.youtube_provider = youtube_provider
        self._rate_lock = asyncio.Lock()
        self._last_request_at = 0.0
        # MusicBrainz recording id -> matched youtube video id, so
        # download_to_file (called right after resolve() in the /stream
        # flow) doesn't have to redo the search-and-match work.
        self._match_cache: dict[str, str] = {}
        # recording id -> (title, artist), filled in by get_album/resolve so
        # a later download_to_file call doesn't need another API round trip.
        self._track_info_cache: dict[str, tuple[str, str]] = {}
        # In-memory + disk caches so revisiting an artist/album page (or
        # restarting the server) doesn't re-pay the 1 req/sec MusicBrainz
        # rate limit every time — a discography rarely changes.
        self._artist_id_cache: dict[str, str | None] = {}
        self._release_groups_cache: dict[str, list[dict]] = {}
        self._album_cache: dict[str, tuple[float, AlbumInfo]] = {}
        self._cache_ttl = 3600.0  # only applies to get_album (has track lists; rest is cached forever)
        self._load_disk_cache()

    # ---------------- disk cache (artist id + release-group lookups) ----------------

    def _load_disk_cache(self) -> None:
        try:
            if _DISK_CACHE_PATH.exists():
                data = json.loads(_DISK_CACHE_PATH.read_text(encoding="utf-8"))
                self._artist_id_cache.update(data.get("artist_ids") or {})
                self._release_groups_cache.update(data.get("release_groups") or {})
        except Exception as exc:
            print(f"[musicbrainz] could not read disk cache, starting fresh: {exc}")

    def _save_disk_cache(self) -> None:
        try:
            _DISK_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "artist_ids": self._artist_id_cache,
                "release_groups": self._release_groups_cache,
            }
            _DISK_CACHE_PATH.write_text(json.dumps(payload), encoding="utf-8")
        except Exception as exc:
            print(f"[musicbrainz] could not write disk cache: {exc}")

    @property
    def configured(self) -> bool:
        # No API key needed — MusicBrainz is open/anonymous.
        return True

    # ---------------- HTTP + rate limiting ----------------

    async def _get(self, path: str, params: dict | None = None, base: str = _API_BASE) -> dict:
        # MusicBrainz's own docs say 503 ("Service Temporarily Unavailable",
        # their overload signal — distinct from a real outage) is routine
        # and the client is expected to just retry. But when their search
        # cluster is having a *sustained* bad period (not just one blip),
        # piling on long exponential backoff makes the page hang even
        # longer for no benefit — so this stays short (2 tries, <1s of
        # extra wait total) and the caller (youtube_music.get_artist) wraps
        # the whole discography lookup in a hard deadline so a persistently
        # unavailable MusicBrainz can never hang the page for more than a
        # few seconds before falling back to YouTube's own (incomplete)
        # album list.
        last_exc: Exception | None = None
        for attempt in range(2):
            async with self._rate_lock:
                elapsed = time.monotonic() - self._last_request_at
                if elapsed < 1.05:
                    await asyncio.sleep(1.05 - elapsed)
                self._last_request_at = time.monotonic()
                url = path if path.startswith("http") else f"{base}{path}"
                try:
                    async with httpx.AsyncClient(timeout=self.settings.provider_timeout) as client:
                        resp = await client.get(
                            url,
                            params={**(params or {}), "fmt": "json"} if base == _API_BASE else params,
                            headers={"User-Agent": _USER_AGENT},
                        )
                        if resp.status_code in (503, 429):
                            last_exc = httpx.HTTPStatusError(
                                f"{resp.status_code} from MusicBrainz", request=resp.request, response=resp
                            )
                        else:
                            resp.raise_for_status()
                            return resp.json()
                except httpx.HTTPError as exc:
                    last_exc = exc
                    if not (isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (503, 429)):
                        raise AppError(ErrorCode.RESOLVE_FAILED, "MusicBrainz request failed") from exc
            # Overloaded — wait outside the rate lock so other calls aren't
            # blocked, then retry once with a short backoff.
            await asyncio.sleep(0.5 * (attempt + 1))
        raise AppError(ErrorCode.RESOLVE_FAILED, "MusicBrainz request failed") from last_exc

    async def _cover_art_url(self, release_group_id: str) -> str | None:
        url = f"{_COVER_ART_BASE}/release-group/{release_group_id}/front-250"
        try:
            async with httpx.AsyncClient(timeout=3.0, follow_redirects=True) as client:
                resp = await client.head(url, headers={"User-Agent": _USER_AGENT})
                if resp.status_code == 200:
                    return url
        except httpx.HTTPError:
            pass
        return None

    # ---------------- MusicProvider surface ----------------

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        data = await self._get("/recording", {"query": query, "limit": limit})
        results = []
        for item in data.get("recordings") or []:
            candidate = self._map_recording(item)
            if candidate:
                results.append(candidate)
        return results

    async def resolve(self, id_or_url: str) -> ResolvedTrack:
        recording_id = self._extract_recording_id(id_or_url)
        if not recording_id:
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Unsupported or invalid MusicBrainz URL")

        title, artist = self._track_info_cache.get(recording_id, (None, None))
        if title is None:
            data = await self._get(f"/recording/{recording_id}", {"inc": "artist-credits"})
            title = data.get("title") or "Unknown"
            artist = _artist_credit_names(data.get("artist-credit"))
            self._track_info_cache[recording_id] = (title, artist)

        video_id = self._match_cache.get(recording_id)
        if not video_id:
            video_id = await self._match_on_youtube(title, artist)
            self._match_cache[recording_id] = video_id

        yt_resolved = await self.youtube_provider.resolve(video_id)

        track = TrackInfo(
            id=public_track_id(SOURCE_NAME, recording_id),
            source=SOURCE_NAME,
            source_id=recording_id,
            title=title,
            artist=artist,
            duration=None,
            artwork=None,
            source_url=f"https://musicbrainz.org/recording/{recording_id}",
            album=None,
            album_id=None,
            artist_id=None,
        )
        return ResolvedTrack(track=track, playback=yt_resolved.playback)

    async def download_to_file(self, id_or_url: str, dest_dir: Path, dest_stem: str):
        recording_id = self._extract_recording_id(id_or_url) or id_or_url
        video_id = self._match_cache.get(recording_id)
        if not video_id:
            title, artist = self._track_info_cache.get(recording_id, (None, None))
            if title is None:
                data = await self._get(f"/recording/{recording_id}", {"inc": "artist-credits"})
                title = data.get("title") or "Unknown"
                artist = _artist_credit_names(data.get("artist-credit"))
                self._track_info_cache[recording_id] = (title, artist)
            video_id = await self._match_on_youtube(title, artist)
            self._match_cache[recording_id] = video_id
        return await self.youtube_provider.download_to_file(video_id, dest_dir, dest_stem)

    def can_handle_url(self, url: str) -> bool:
        try:
            host = urlparse(url).netloc.lower()
        except ValueError:
            return False
        return host.endswith("musicbrainz.org")

    _UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

    @classmethod
    def _extract_recording_id(cls, id_or_url: str) -> str | None:
        value = (id_or_url or "").strip()
        if not value:
            return None
        match = cls._UUID_RE.search(value)
        return match.group(0) if match else None

    async def _match_on_youtube(self, title: str, artist: str) -> str:
        """Find the best-matching YouTube video for a MusicBrainz track,
        using the same text-similarity scoring the search endpoint uses."""
        # Lead with just the primary artist — MusicBrainz artist-credit
        # strings can list every collaborator ("Travis Scott, Quavo, Offset,
        # ...") and stuffing all of that into the YouTube search query
        # tends to push the actual official upload out of the top results,
        # which is what was causing wrong tracks to get matched/played.
        primary_artist = artist.split(",")[0].strip() if artist else artist
        query = f"{title} {primary_artist}".strip()
        try:
            yt_candidates = await self.youtube_provider.search(query, 8)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not find a playable match on YouTube") from exc
        if not yt_candidates:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not find a playable match on YouTube")
        ranked = rank_candidates(query, yt_candidates)
        best = ranked[0]
        print(
            f"[musicbrainz match] query={query!r} -> best={best.title!r} by {best.artist!r} "
            f"confidence={best.confidence} (runner-up: "
            + ", ".join(f"{c.title!r}/{c.confidence}" for c in ranked[1:4])
            + ")"
        )
        if (best.confidence or 0) < 0.45:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not find a confident playable match on YouTube")
        return best.source_id

    def _map_recording(self, item: dict) -> TrackCandidate | None:
        recording_id = item.get("id")
        if not recording_id:
            return None
        artist = _artist_credit_names(item.get("artist-credit"))
        release = (item.get("releases") or [{}])[0]
        return TrackCandidate(
            id=public_track_id(SOURCE_NAME, recording_id),
            source=SOURCE_NAME,
            source_id=recording_id,
            title=item.get("title") or "Unknown",
            artist=artist,
            duration=_duration_seconds(item.get("length")),
            artwork=None,
            source_url=f"https://musicbrainz.org/recording/{recording_id}",
            album=release.get("title"),
            album_id=(release.get("release-group") or {}).get("id"),
            artist_id=None,
        )

    # ---------------- catalog browsing ----------------

    async def find_artist_id(self, name: str) -> str | None:
        if not name:
            return None
        cache_key = name.strip().lower()
        if cache_key in self._artist_id_cache:
            return self._artist_id_cache[cache_key]
        data = await self._get("/artist", {"query": f'artist:"{name}"', "limit": 5})
        items = data.get("artists") or []
        result = None
        if items:
            exact = [i for i in items if (i.get("name") or "").strip().lower() == name.strip().lower()]
            result = (exact or items)[0].get("id")
        self._artist_id_cache[cache_key] = result
        self._save_disk_cache()
        return result

    async def albums_for_artist_name(self, name: str) -> list[AlbumSummary]:
        """Look an artist up by display name (used to augment another
        provider's artist page, which only has the name in common with
        MusicBrainz's own catalog — not a shared id) and return their full,
        deduplicated discography."""
        artist_id = await self.find_artist_id(name)
        if not artist_id:
            return []
        raw_groups = await self._fetch_all_release_groups(artist_id)
        return await self._dedupe_and_build(raw_groups)

    async def get_artist(self, artist_id: str) -> ArtistInfo:
        data = await self._get(f"/artist/{artist_id}")
        name = data.get("name") or "Unknown artist"

        raw_groups = await self._fetch_all_release_groups(artist_id)
        albums = await self._dedupe_and_build(raw_groups)

        return ArtistInfo(
            id=artist_id,
            source=SOURCE_NAME,
            name=name,
            photo=None,
            subscribers=None,
            top_tracks=[],
            albums=albums,
        )

    async def _fetch_all_release_groups(self, artist_id: str) -> list[dict]:
        cached = self._release_groups_cache.get(artist_id)
        if cached is not None:
            return cached

        entries: list[dict] = []
        offset = 0
        limit = 100
        while True:
            data = await self._get(
                "/release-group",
                {"artist": artist_id, "limit": limit, "offset": offset},
            )
            batch = data.get("release-groups") or []
            entries.extend(batch)
            total = data.get("release-group-count") or len(entries)
            offset += limit
            if len(batch) < limit or offset >= total:
                break
        self._release_groups_cache[artist_id] = entries
        self._save_disk_cache()
        return entries

    def _keep_release_group(self, entry: dict) -> bool:
        primary = (entry.get("primary-type") or "").lower()
        if primary not in {"album", "single", "ep"}:
            return False
        secondary = {s.lower() for s in (entry.get("secondary-types") or [])}
        if secondary & _EXCLUDED_SECONDARY_TYPES:
            return False
        return True

    async def _dedupe_and_build(self, raw_groups: list[dict]) -> list[AlbumSummary]:
        # MusicBrainz can list slightly different regional/reissue release-
        # groups with the same title — keep the earliest-dated copy of each
        # distinct title so the UI doesn't show duplicates.
        best_by_key: dict[str, dict] = {}
        for entry in raw_groups:
            if not self._keep_release_group(entry):
                continue
            title = (entry.get("title") or "").strip().lower()
            if not title:
                continue
            existing = best_by_key.get(title)
            if existing is None or (entry.get("first-release-date") or "9999") < (existing.get("first-release-date") or "9999"):
                best_by_key[title] = entry

        # Fetch cover art in parallel (bounded) — a different host than
        # MusicBrainz itself, so it isn't subject to the 1 req/sec limit.
        sem = asyncio.Semaphore(5)

        async def _cover(entry: dict) -> tuple[str, str | None]:
            async with sem:
                return entry["id"], await self._cover_art_url(entry["id"])

        covers: dict[str, str | None] = {}
        if best_by_key:
            results = await asyncio.gather(*(_cover(e) for e in best_by_key.values()))
            covers = dict(results)

        summaries = []
        for entry in best_by_key.values():
            primary = (entry.get("primary-type") or "album").lower()
            release_date = entry.get("first-release-date") or ""
            year = release_date[:4] if release_date else None
            summaries.append(
                AlbumSummary(
                    id=entry["id"],
                    title=entry.get("title") or "Unknown album",
                    year=year,
                    cover=covers.get(entry["id"]),
                    type="single" if primary in {"single", "ep"} else "album",
                    source=SOURCE_NAME,
                )
            )
        summaries.sort(key=lambda a: a.year or "0", reverse=True)
        return summaries

    async def get_album(self, album_id: str) -> AlbumInfo:
        cached = self._album_cache.get(album_id)
        if cached and (time.monotonic() - cached[0]) < self._cache_ttl:
            return cached[1]

        rg_data = await self._get(f"/release-group/{album_id}", {"inc": "releases+artist-credits"})
        title = rg_data.get("title") or "Unknown album"
        artist_name = _artist_credit_names(rg_data.get("artist-credit"))
        artist_id = None
        credits = rg_data.get("artist-credit") or []
        if credits:
            artist_id = (credits[0].get("artist") or {}).get("id")
        release_date = rg_data.get("first-release-date") or ""
        year = release_date[:4] if release_date else None
        cover = await self._cover_art_url(album_id)

        releases = rg_data.get("releases") or []
        official = [r for r in releases if (r.get("status") or "").lower() == "official"]
        pool = official or releases
        pool = sorted(pool, key=lambda r: r.get("date") or "9999")
        chosen = pool[0] if pool else None

        tracks: list[TrackCandidate] = []
        if chosen:
            release_data = await self._get(f"/release/{chosen['id']}", {"inc": "recordings+artist-credits"})
            for medium in release_data.get("media") or []:
                for track in medium.get("tracks") or []:
                    recording = track.get("recording") or {}
                    recording_id = recording.get("id")
                    if not recording_id:
                        continue
                    track_artist = _artist_credit_names(track.get("artist-credit") or recording.get("artist-credit")) or artist_name
                    self._track_info_cache[recording_id] = (recording.get("title") or track.get("title") or "Unknown", track_artist)
                    tracks.append(
                        TrackCandidate(
                            id=public_track_id(SOURCE_NAME, recording_id),
                            source=SOURCE_NAME,
                            source_id=recording_id,
                            title=recording.get("title") or track.get("title") or "Unknown",
                            artist=track_artist,
                            duration=_duration_seconds(track.get("length") or recording.get("length")),
                            artwork=cover,
                            source_url=f"https://musicbrainz.org/recording/{recording_id}",
                            album=title,
                            album_id=album_id,
                            artist_id=artist_id,
                        )
                    )

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
