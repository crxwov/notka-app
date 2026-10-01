from fastapi import FastAPI

from music_resolver.api.routes import create_router
from music_resolver.config import Settings, load_settings
from music_resolver.errors import AppError, app_error_handler, unhandled_error_handler
from music_resolver.services.factory import build_music_service
from music_resolver.services.music_service import MusicService
from music_resolver.utils.logging import configure_logging


def create_app(settings: Settings | None = None, service: MusicService | None = None) -> FastAPI:
    settings = settings or load_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title="Music Resolver Backend", version="0.1.0")
    service = service or build_music_service(settings)

    app.include_router(create_router(service, settings))
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
    return app


app = create_app()
