import asyncio
import logging
import time

from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import ResolvedTrack, TrackCandidate
from music_resolver.providers.base import MusicProvider
from music_resolver.services.matcher import rank_candidates
from music_resolver.services.proxy_guard import proxy_guard
from music_resolver.utils.logging import log_provider_result

logger = logging.getLogger(__name__)

# The whole search (all fallbacks together) never waits longer than this:
# four sources at 15 s each used to leave the app spinning for a minute.
SEARCH_DEADLINE = 22.0


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
        began = time.perf_counter()
        for index, provider in enumerate(self.providers):
            remaining = SEARCH_DEADLINE - (time.perf_counter() - began)
            if remaining <= 1.0:
                errors.append(f"{provider.name}: skipped (deadline)")
                continue
            start = time.perf_counter()
            fallback_used = index > 0
            try:
                results = await asyncio.wait_for(provider.search(query, limit), timeout=min(self.timeout, remaining))
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
            proxy_guard.nudge()  # everything failed: maybe the proxy died
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
                if len(providers) == 1:
                    raise  # keep the real reason (e.g. TRACK_NOT_FOUND) for the app's message
            except Exception as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                errors.append(f"{provider.name}: error")
                logger.debug("Provider resolve failed", exc_info=exc)
                log_provider_result("RESOLVE", provider.name, duration_ms, False, fallback_used, error="unexpected")
        raise AppError(ErrorCode.RESOLVE_FAILED, "Track could not be resolved by available providers", {"providers": errors})

    def _resolve_order(self, source: str | None, id_or_url: str) -> list[MusicProvider]:
        ordered: list[MusicProvider] = []
        looks_like_url = "://" in id_or_url
        if source:
            provider = self.get(source)
            if provider:
                # A bare id only means something to the source it came from:
                # iTunes and SoundCloud ids are both plain numbers, so trying
                # the others would play an unrelated track under this title.
                if not looks_like_url:
                    return [provider]
                ordered.append(provider)
        for provider in self.providers:
            if provider in ordered:
                continue
            if looks_like_url and not provider.can_handle_url(id_or_url):
                continue
            ordered.append(provider)
        return ordered
