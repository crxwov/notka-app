import os
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

    docs_enabled = os.environ.get("ENABLE_DOCS", "0").strip() == "1"
    app = FastAPI(
        title="Music Resolver Backend",
        version="0.1.0",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    service = service or build_music_service(settings)

    app.include_router(create_router(service, settings))
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
    return app


app = create_app()


def mount_miniapp(app: FastAPI, directory) -> None:
    """Подключает интерфейс Нотки на /app со сжатием (gzip режет ~530 КБ до ~120 КБ).

    Сжатие стоит только на файлах интерфейса: на весь сервер его ставить нельзя,
    иначе пострадают потоки аудио и запросы Range.
    """
    from starlette.applications import Starlette
    from starlette.middleware import Middleware
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.middleware.gzip import GZipMiddleware
    from starlette.staticfiles import StaticFiles

    class Revalidate(BaseHTTPMiddleware):
        """Страница и её скрипты с телефона каждый раз сверяются с сервером (304, если не менялись):
        иначе Telegram держит старый index.html и новые версии не доходят."""

        async def dispatch(self, request, call_next):
            response = await call_next(request)
            path = request.url.path
            if path.endswith(("/", ".html", ".js", ".css")) or "." not in path.rsplit("/", 1)[-1]:
                response.headers["Cache-Control"] = "no-cache"
            return response

    static = Starlette(middleware=[Middleware(GZipMiddleware, minimum_size=1024), Middleware(Revalidate)])
    static.mount("/", StaticFiles(directory=str(directory), html=True))
    app.mount("/app", static, name="miniapp")
