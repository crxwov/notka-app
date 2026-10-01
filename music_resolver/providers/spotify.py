"""Spotify as a *catalog* source only.

Spotify has no open/unlicensed streaming, so this provider never plays
audio itself — it only supplies search/album/artist metadata, which is far
more complete and reliably structured than what YouTube Music's own artist
pages expose (some verified/major-label artist channels there simply don't
list their full discography — see youtube_music.map_artist's comments).

When a track actually needs to *play*, this provider looks it up by title
+ artist against a YouTube-backed provider (passed in at construction) using
the same text-similarity matcher the search endpoint uses, and delegates
playback (resolve + the actual audio download) to that match. The track
identity shown to the rest of the app (id, source="spotify", duration,
artwork, ...) stays Spotify's own — only the underlying audio bytes come
from YouTube.
"""

import asyncio
import base64
import re
import threading
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
    PlaybackInfo,
    ResolvedTrack,
    TrackCandidate,
    TrackInfo,
    public_track_id,
)
from music_resolver.services.matcher import rank_candidates

SOURCE_NAME = "spotify"
_API_BASE = "https://api.spotify.com/v1"
_TOKEN_URL = "https://accounts.spotify.com/api/token"


def _best_image(images: list[dict] | None) -> str | None:
    if not images:
        return None
    return images[0].get("url")


def _artist_names(artists: list[dict] | None) -> str:
    return ", ".join(a.get("name", "") for a in (artists or []) if a.get("name"))


def _duration_seconds(duration_ms) -> int | None:
    return int(duration_ms / 1000) if duration_ms else None


class SpotifyProvider:
    """Duck-types enough of MusicProvider to slot into ProviderManager, plus
    get_album/get_artist/download_to_file like the YouTube providers."""

    name = SOURCE_NAME

    def __init__(self, settings: Settings, youtube_provider) -> None:
        self.settings = settings
        self.youtube_provider = youtube_provider
        self._token: str | None = None
        self._token_expires_at: float = 0.0
        self._lock = threading.Lock()
        # spotify track id -> matched youtube video id, so download_to_file
        # (called right after resolve() in the /stream flow) doesn't have to
        # redo the search-and-match work resolve() already did.
        self._match_cache: dict[str, str] = {}

    @property
    def configured(self) -> bool:
        return bool(self.settings.spotify_client_id and self.settings.spotify_client_secret)

    # ---------------- auth ----------------

    async def _get_token(self) -> str:
        if self._token and time.time() < self._token_expires_at - 30:
            return self._token
        return await asyncio.to_thread(self._fetch_token_sync)

    def _fetch_token_sync(self) -> str:
        with self._lock:
            if self._token and time.time() < self._token_expires_at - 30:
                return self._token
            client_id = self.settings.spotify_client_id
            client_secret = self.settings.spotify_client_secret
            if not client_id or not client_secret:
                raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Spotify is not configured")
            basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
            try:
                resp = httpx.post(
                    _TOKEN_URL,
                    data={"grant_type": "client_credentials"},
                    headers={"Authorization": f"Basic {basic}"},
                    timeout=self.settings.provider_timeout,
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPError as exc:
                raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Could not authenticate with Spotify") from exc
            self._token = data["access_token"]
            self._token_expires_at = time.time() + int(data.get("expires_in", 3600))
            return self._token

    async def _get(self, path: str, params: dict | None = None) -> dict:
        token = await self._get_token()
        url = path if path.startswith("http") else f"{_API_BASE}{path}"
        try:
            async with httpx.AsyncClient(timeout=self.settings.provider_timeout) as client:
                resp = await client.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Spotify request failed") from exc

    # ---------------- mapping ----------------

    def _map_track(self, item: dict, album_name: str | None = None, album_id: str | None = None) -> TrackCandidate | None:
        track_id = item.get("id")
        if not track_id:
            return None
        album = item.get("album") or {}
        artists = item.get("artists")
        artist_id = None
        if artists:
            artist_id = artists[0].get("id")
        return TrackCandidate(
            id=public_track_id(SOURCE_NAME, track_id),
            source=SOURCE_NAME,
            source_id=track_id,
            title=item.get("name") or "Unknown",
            artist=_artist_names(artists),
            duration=_duration_seconds(item.get("duration_ms")),
            artwork=_best_image(album.get("images")) if album else None,
            source_url=(item.get("external_urls") or {}).get("spotify"),
            album=album.get("name") or album_name,
            album_id=album.get("id") or album_id,
            artist_id=artist_id,
        )

    # ---------------- MusicProvider surface ----------------

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        if not self.configured:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Spotify is not configured")
        data = await self._get("/search", {"q": query, "type": "track", "limit": limit})
        items = ((data.get("tracks") or {}).get("items")) or []
        results = []
        for item in items:
            candidate = self._map_track(item)
            if candidate:
                results.append(candidate)
        return results

    async def resolve(self, id_or_url: str) -> ResolvedTrack:
        track_id = self._extract_track_id(id_or_url)
        if not track_id:
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Unsupported or invalid Spotify URL")
        data = await self._get(f"/tracks/{track_id}")
        candidate = self._map_track(data)
        if not candidate:
            raise AppError(ErrorCode.TRACK_NOT_FOUND, "Spotify track was not found")

        video_id = self._match_cache.get(track_id)
        if not video_id:
            video_id = await self._match_on_youtube(candidate)
            self._match_cache[track_id] = video_id

        yt_resolved = await self.youtube_provider.resolve(video_id)

        track = TrackInfo(
            id=candidate.id,
            source=SOURCE_NAME,
            source_id=track_id,
            title=candidate.title,
            artist=candidate.artist,
            duration=candidate.duration,
            artwork=candidate.artwork,
            source_url=candidate.source_url,
            album=candidate.album,
            album_id=candidate.album_id,
            artist_id=candidate.artist_id,
        )
        return ResolvedTrack(track=track, playback=yt_resolved.playback)

    async def download_to_file(self, id_or_url: str, dest_dir: Path, dest_stem: str):
        track_id = self._extract_track_id(id_or_url) or id_or_url
        video_id = self._match_cache.get(track_id)
        if not video_id:
            # download_to_file is normally only reached after resolve()
            # already populated the cache, but resolve independently if not.
            data = await self._get(f"/tracks/{track_id}")
            candidate = self._map_track(data)
            if not candidate:
                raise AppError(ErrorCode.TRACK_NOT_FOUND, "Spotify track was not found")
            video_id = await self._match_on_youtube(candidate)
            self._match_cache[track_id] = video_id
        return await self.youtube_provider.download_to_file(video_id, dest_dir, dest_stem)

    def can_handle_url(self, url: str) -> bool:
        try:
            host = urlparse(url).netloc.lower()
        except ValueError:
            return False
        return host.endswith("spotify.com") or url.startswith("spotify:")

    @staticmethod
    def _extract_track_id(id_or_url: str) -> str | None:
        value = (id_or_url or "").strip()
        if not value:
            return None
        if re.fullmatch(r"[A-Za-z0-9]{22}", value):
            return value
        match = re.search(r"track[/:]([A-Za-z0-9]{22})", value)
        return match.group(1) if match else None

    async def _match_on_youtube(self, candidate: TrackCandidate) -> str:
        """Find the best-matching YouTube video for a Spotify track, using
        the same text-similarity scoring the search endpoint uses."""
        query = f"{candidate.title} {candidate.artist}".strip()
        try:
            yt_candidates = await self.youtube_provider.search(query, 8)
        except Exception as exc:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not find a playable match on YouTube") from exc
        if not yt_candidates:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not find a playable match on YouTube")
        ranked = rank_candidates(query, yt_candidates)
        best = ranked[0]
        if (best.confidence or 0) < 0.35:
            raise AppError(ErrorCode.RESOLVE_FAILED, "Could not find a confident playable match on YouTube")
        return best.source_id

    # ---------------- catalog browsing ----------------

    async def find_artist_id(self, name: str) -> str | None:
        if not self.configured or not name:
            return None
        data = await self._get("/search", {"q": name, "type": "artist", "limit": 5})
        items = ((data.get("artists") or {}).get("items")) or []
        if not items:
            return None
        exact = [i for i in items if (i.get("name") or "").strip().lower() == name.strip().lower()]
        best = (exact or items)[0]
        return best.get("id")

    async def albums_for_artist_name(self, name: str) -> list[AlbumSummary]:
        """Look an artist up by display name (used to augment another
        provider's artist page, which only has the name in common with
        Spotify's own catalog — not a shared id) and return their full,
        deduplicated discography."""
        artist_id = await self.find_artist_id(name)
        if not artist_id:
            return []
        raw_albums = await self._fetch_all_artist_albums(artist_id)
        return self._dedupe_albums(raw_albums)

    async def get_artist(self, artist_id: str) -> ArtistInfo:
        data = await self._get(f"/artists/{artist_id}")
        name = data.get("name") or "Unknown artist"
        photo = _best_image(data.get("images"))
        followers = ((data.get("followers") or {}).get("total"))

        top_data = await self._get(f"/artists/{artist_id}/top-tracks", {"market": "US"})
        top_tracks = []
        for item in top_data.get("tracks") or []:
            candidate = self._map_track(item)
            if candidate:
                top_tracks.append(candidate)

        raw_albums = await self._fetch_all_artist_albums(artist_id)
        albums = self._dedupe_albums(raw_albums)

        return ArtistInfo(
            id=artist_id,
            source=SOURCE_NAME,
            name=name,
            photo=photo,
            subscribers=f"{followers:,}".replace(",", " ") if followers else None,
            top_tracks=top_tracks,
            albums=albums,
        )

    async def _fetch_all_artist_albums(self, artist_id: str) -> list[dict]:
        entries: list[dict] = []
        params = {"include_groups": "album,single", "limit": 50, "market": "US"}
        url = f"/artists/{artist_id}/albums"
        while url:
            data = await self._get(url, params if not url.startswith("http") else None)
            entries.extend(data.get("items") or [])
            url = data.get("next")
            params = None
        return entries

    def _dedupe_albums(self, raw_albums: list[dict]) -> list[AlbumSummary]:
        # Spotify commonly lists the same release many times over (regional
        # re-releases, deluxe/remaster reissues with an identical name) —
        # keep the earliest-released copy of each distinct title so the UI
        # doesn't show duplicates.
        best_by_key: dict[str, dict] = {}
        for entry in raw_albums:
            title = (entry.get("name") or "").strip().lower()
            if not title:
                continue
            key = title
            existing = best_by_key.get(key)
            if existing is None or (entry.get("release_date") or "") < (existing.get("release_date") or ""):
                best_by_key[key] = entry

        summaries = []
        for entry in best_by_key.values():
            album_type = (entry.get("album_type") or "album").lower()
            release_date = entry.get("release_date") or ""
            year = release_date[:4] if release_date else None
            summaries.append(
                AlbumSummary(
                    id=entry["id"],
                    title=entry.get("name") or "Unknown album",
                    year=year,
                    cover=_best_image(entry.get("images")),
                    type="single" if album_type in {"single", "compilation"} else "album",
                    source=SOURCE_NAME,
                )
            )
        summaries.sort(key=lambda a: a.year or "0", reverse=True)
        return summaries

    async def get_album(self, album_id: str) -> AlbumInfo:
        data = await self._get(f"/albums/{album_id}")
        title = data.get("name") or "Unknown album"
        artists = data.get("artists")
        artist_name = _artist_names(artists)
        artist_id = artists[0].get("id") if artists else None
        cover = _best_image(data.get("images"))
        release_date = data.get("release_date") or ""
        year = release_date[:4] if release_date else None

        tracks: list[TrackCandidate] = []
        track_items = ((data.get("tracks") or {}).get("items")) or []
        next_url = (data.get("tracks") or {}).get("next")
        for item in track_items:
            candidate = self._map_track(item, album_name=title, album_id=album_id)
            if candidate:
                if not candidate.artwork:
                    candidate = candidate.model_copy(update={"artwork": cover})
                tracks.append(candidate)
        while next_url:
            more = await self._get(next_url)
            for item in more.get("items") or []:
                candidate = self._map_track(item, album_name=title, album_id=album_id)
                if candidate:
                    if not candidate.artwork:
                        candidate = candidate.model_copy(update={"artwork": cover})
                    tracks.append(candidate)
            next_url = more.get("next")

        return AlbumInfo(
            id=album_id,
            source=SOURCE_NAME,
            title=title,
            artist=artist_name,
            artist_id=artist_id,
            year=year,
            cover=cover,
            tracks=tracks,
        )
