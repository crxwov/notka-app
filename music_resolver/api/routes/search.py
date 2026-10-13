import asyncio
from fastapi import APIRouter, Query

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import AlbumResponse, ArtistResponse, ResolveResponse, SearchResponse
from music_resolver.services import metrics
from music_resolver.services.music_service import MusicService


def register_search_routes(router: APIRouter, service: MusicService, settings: Settings) -> None:
    @router.get("/search", response_model=SearchResponse)
    async def search(
        q: str = Query(..., min_length=1),
        limit: int = Query(default=None, ge=1, le=50),
    ) -> SearchResponse:
        metrics.count("search")
        return await service.search(q, limit=limit or settings.search_limit)

    @router.get("/artists")
    async def artists(
        q: str = Query(..., min_length=1, max_length=200),
        limit: int = Query(default=8, ge=1, le=20),
    ) -> dict:
        provider = service.manager.get("youtube_music")
        if provider is None or not hasattr(provider, "search_artists"):
            return {"results": []}
        try:
            found = await asyncio.wait_for(provider.search_artists(q, limit), timeout=settings.provider_timeout)
        except Exception:
            found = []
        return {"results": found}

    @router.get("/resolve", response_model=ResolveResponse)
    async def resolve(
        source: str | None = Query(default=None),
        id: str | None = Query(default=None),
        url: str | None = Query(default=None),
    ) -> ResolveResponse:
        return await service.resolve(source=source, id=id, url=url)

    @router.get("/album", response_model=AlbumResponse)
    async def album(
        source: str | None = Query(default=None),
        id: str | None = Query(default=None),
    ) -> AlbumResponse:
        info = await service.get_album(source, id)
        return AlbumResponse(**info.model_dump(by_alias=True))

    @router.get("/artist", response_model=ArtistResponse)
    async def artist(
        source: str | None = Query(default=None),
        id: str | None = Query(default=None),
        fast: bool = Query(default=False),
    ) -> ArtistResponse:
        info = await service.get_artist(source, id, fast=fast)
        return ArtistResponse(**info.model_dump(by_alias=True))

    @router.get("/radio", response_model=SearchResponse)
    async def radio(
        source: str = Query(...),
        id: str = Query(..., min_length=1),
        limit: int = Query(default=25, ge=1, le=50),
    ) -> SearchResponse:
        provider = service.manager.get(source)
        if provider is None or not hasattr(provider, "radio"):
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "This source has no radio")
        try:
            tracks = await asyncio.wait_for(provider.radio(id, limit), timeout=settings.provider_timeout)
        except asyncio.TimeoutError as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Radio timed out") from exc
        except AppError:
            raise
        except Exception as exc:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "Radio is unavailable") from exc
        return SearchResponse(results=tracks)
