import logging
from enum import Enum

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class ErrorCode(str, Enum):
    INVALID_QUERY = "INVALID_QUERY"
    TRACK_NOT_FOUND = "TRACK_NOT_FOUND"
    ALBUM_NOT_FOUND = "ALBUM_NOT_FOUND"
    ARTIST_NOT_FOUND = "ARTIST_NOT_FOUND"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    RESOLVE_FAILED = "RESOLVE_FAILED"
    INVALID_SOURCE_URL = "INVALID_SOURCE_URL"
    TIMEOUT = "TIMEOUT"


_HTTP_STATUS = {
    ErrorCode.INVALID_QUERY: 400,
    ErrorCode.TRACK_NOT_FOUND: 404,
    ErrorCode.ALBUM_NOT_FOUND: 404,
    ErrorCode.ARTIST_NOT_FOUND: 404,
    ErrorCode.PROVIDER_UNAVAILABLE: 503,
    ErrorCode.RESOLVE_FAILED: 502,
    ErrorCode.INVALID_SOURCE_URL: 400,
    ErrorCode.TIMEOUT: 504,
}


class AppError(Exception):
    def __init__(self, code: ErrorCode, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    @property
    def status_code(self) -> int:
        return _HTTP_STATUS.get(self.code, 500)


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    payload: dict[str, dict] = {
        "error": {
            "code": exc.code.value,
            "message": exc.message,
        }
    }
    if exc.details:
        payload["error"]["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content=payload)


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled error on %s", request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
    )
