import asyncio
from pathlib import Path
from fastapi import APIRouter, Query, Request

from music_resolver.errors import AppError, ErrorCode
from music_resolver.services import metrics, mood_mix, track_profile
from music_resolver.services.lyrics import find_lyrics
from music_resolver.services.music_service import MusicService
from music_resolver.api.routes.audio_cache import cache_key, cached_file, match_suffix_for


def register_content_routes(router: APIRouter, service: MusicService) -> None:
    @router.get("/lyrics")
    async def lyrics(
        title: str = Query(..., min_length=1, max_length=300),
        artist: str = Query(default="", max_length=300),
        duration: float | None = Query(default=None, ge=0, le=36000),
        source: str | None = Query(default=None),
        id: str | None = Query(default=None),
    ) -> dict:
        metrics.count("lyrics")
        provider = service.manager.get("youtube_music") if source == "youtube_music" and id else None
        return await find_lyrics(title, artist, duration, youtube_music_provider=provider, video_id=id)

    @router.post("/mood")
    async def mood(request: Request):
        try:
            body = await request.json()
        except ValueError:
            body = {}
        metrics.count("mood")
        key = str(body.get("key") or "")
        seeds = [s for s in (body.get("seeds") or [])[:40] if isinstance(s, dict) and s.get("source") and s.get("id")]
        artists = [str(a)[:80] for a in (body.get("artists") or [])[:60] if isinstance(a, str)]
        ru_share = body.get("ru_share")
        ru_share = float(ru_share) if isinstance(ru_share, (int, float)) else None
        provider = service.manager.get("youtube_music")
        if provider is None or not hasattr(provider, "mood_tracks"):
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Moods are not available")

        def video_id(source: str, source_id: str) -> str | None:
            if source == "youtube_music":
                return source_id
            other = service.manager.get(source)
            matched = getattr(other, "matched_video_id", None)
            return matched(source_id) if matched else None

        def audio_path(source: str, source_id: str) -> Path | None:
            cached = cached_file(cache_key(source, source_id, match_suffix_for(service.manager.get(source), source_id)))
            return cached[0] if cached else None

        try:
            tracks, grown_from = await asyncio.wait_for(
                asyncio.to_thread(mood_mix.build, provider, key, 40, seeds, artists, ru_share, audio_path, video_id), timeout=50
            )
        except asyncio.TimeoutError as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Mood mix timed out") from exc
        except AppError:
            raise
        except Exception as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Mood mix is unavailable") from exc
        return {"results": [t.model_dump(by_alias=True) for t in tracks], "grownFrom": grown_from}

    @router.get("/profile")
    async def track_profile_view(source: str = Query(...), id: str = Query(...), artist: str = Query(default="")) -> dict:
        key = f"{source}_{id}"
        own = track_profile.known(key)
        fits = {}
        for m in track_profile.MOODS:
            fit, how = track_profile.fit_for(key, artist, m)
            fits[m] = {"fit": fit, "from": how}
        ak = track_profile.artist_key(artist)
        with track_profile._lock:
            tags = (track_profile._artists_db().get(ak) or {}).get("tags") or []
        track_profile.want_artist(artist)
        return {"sound": own, "moods": fits, "tags": tags, "profiled_tracks": track_profile.known_count()}
