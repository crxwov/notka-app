import asyncio
import logging
import time

from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import ResolvedTrack, TrackCandidate
from music_resolver.providers.base import MusicProvider
from music_resolver.services.matcher import rank_candidates
from music_resolver.utils.logging import log_provider_result

logger = logging.getLogger(__name__)


class ProviderManager:
    def __init__(self, providers: list[MusicProvider], timeout: float) -> None:
        self.providers = providers
        self.timeout = timeout
        self._by_name = {provider.name: provider for provider in providers}

    def get(self, name: str) -> MusicProvider | None:
        return self._by_name.get(name)

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        if not self.providers:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "No search providers are configured")

        errors: list[str] = []
        empty_seen = False
        for index, provider in enumerate(self.providers):
            start = time.perf_counter()
            fallback_used = index > 0
            try:
                results = await asyncio.wait_for(provider.search(query, limit), timeout=self.timeout)
                duration_ms = int((time.perf_counter() - start) * 1000)
                if not results:
                    empty_seen = True
                    log_provider_result("SEARCH", provider.name, duration_ms, False, fallback_used, reason="empty")
                    continue
                ranked = rank_candidates(query, results)
                log_provider_result("SEARCH", provider.name, duration_ms, True, fallback_used)
                return ranked
            except asyncio.TimeoutError:
                duration_ms = int((time.perf_counter() - start) * 1000)
                errors.append(f"{provider.name}: timeout")
                log_provider_result("SEARCH", provider.name, duration_ms, False, fallback_used, timeout=True)
            except AppError as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                errors.append(f"{provider.name}: {exc.code.value}")
                log_provider_result("SEARCH", provider.name, duration_ms, False, fallback_used, error=exc.code.value)
            except Exception as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                errors.append(f"{provider.name}: error")
                logger.debug("Provider search failed", exc_info=exc)
                log_provider_result("SEARCH", provider.name, duration_ms, False, fallback_used, error="unexpected")

        if errors and not empty_seen and len(errors) >= len(self.providers):
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "All search providers are unavailable", {"providers": errors})
        raise AppError(ErrorCode.TRACK_NOT_FOUND, "Track was not found in available providers")

    async def resolve(self, id_or_url: str, source: str | None = None) -> ResolvedTrack:
        if not self.providers:
            raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "No resolve providers are configured")

        providers = self._resolve_order(source, id_or_url)
        if not providers:
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "No provider can handle the given source or URL")

        errors: list[str] = []
        for index, provider in enumerate(providers):
            start = time.perf_counter()
            fallback_used = index > 0
            try:
                result = await asyncio.wait_for(provider.resolve(id_or_url), timeout=self.timeout)
                duration_ms = int((time.perf_counter() - start) * 1000)
                if not result.playback.url:
                    errors.append(f"{provider.name}: empty playback")
                    log_provider_result("RESOLVE", provider.name, duration_ms, False, fallback_used, error="empty_playback")
                    continue
                log_provider_result("RESOLVE", provider.name, duration_ms, True, fallback_used)
                return result
            except asyncio.TimeoutError:
                duration_ms = int((time.perf_counter() - start) * 1000)
                errors.append(f"{provider.name}: timeout")
                log_provider_result("RESOLVE", provider.name, duration_ms, False, fallback_used, timeout=True)
            except AppError as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                errors.append(f"{provider.name}: {exc.code.value}")
                log_provider_result("RESOLVE", provider.name, duration_ms, False, fallback_used, error=exc.code.value)
            except Exception as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                errors.append(f"{provider.name}: error")
                logger.debug("Provider resolve failed", exc_info=exc)
                log_provider_result("RESOLVE", provider.name, duration_ms, False, fallback_used, error="unexpected")
        raise AppError(ErrorCode.RESOLVE_FAILED, "Track could not be resolved by available providers", {"providers": errors})

    def _resolve_order(self, source: str | None, id_or_url: str) -> list[MusicProvider]:
        ordered: list[MusicProvider] = []
        if source:
            provider = self.get(source)
            if provider:
                ordered.append(provider)
        looks_like_url = "://" in id_or_url
        for provider in self.providers:
            if provider in ordered:
                continue
            if looks_like_url and not provider.can_handle_url(id_or_url):
                continue
            ordered.append(provider)
        return ordered
