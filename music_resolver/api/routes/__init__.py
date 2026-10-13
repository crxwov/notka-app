import threading
from fastapi import APIRouter

from music_resolver.config import Settings
from music_resolver.services.music_service import MusicService
from music_resolver.utils.remux import defragment_all

from music_resolver.api.routes.admin import register_admin_routes
from music_resolver.api.routes.audio import register_audio_routes
from music_resolver.api.routes.audio_cache import get_cache_dir
from music_resolver.api.routes.auth import register_auth_routes
from music_resolver.api.routes.content import register_content_routes
from music_resolver.api.routes.events import register_events_routes
from music_resolver.api.routes.media import register_media_routes
from music_resolver.api.routes.playlists import register_playlists_routes
from music_resolver.api.routes.plus import register_plus_routes
from music_resolver.api.routes.search import register_search_routes


def create_router(service: MusicService, settings: Settings) -> APIRouter:
    router = APIRouter()

    # Track defragmentation in background
    threading.Thread(target=defragment_all, args=(get_cache_dir(),), daemon=True).start()

    # Register each functional domain
    register_audio_routes(router, service, settings)
    register_search_routes(router, service, settings)
    register_auth_routes(router)
    register_plus_routes(router)
    register_events_routes(router)
    register_content_routes(router, service)
    register_playlists_routes(router, service)
    register_media_routes(router)
    register_admin_routes(router)

    return router


__all__ = ["create_router"]
