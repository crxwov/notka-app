from typing import Protocol

from music_resolver.models import ResolvedTrack, TrackCandidate


class MusicProvider(Protocol):
    name: str

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        ...

    async def resolve(self, id_or_url: str) -> ResolvedTrack:
        ...

    def can_handle_url(self, url: str) -> bool:
        ...
