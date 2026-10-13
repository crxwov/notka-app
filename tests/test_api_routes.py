import pytest
from starlette.testclient import TestClient
from music_resolver.main import create_app
from music_resolver.config import Settings, load_settings
from music_resolver.services.music_service import MusicService
from music_resolver.services.provider_manager import ProviderManager
from music_resolver.models import TrackCandidate


class DummyProvider:
    name = "youtube_music"
    configured = True

    async def search(self, query: str, limit: int):
        return [
            TrackCandidate(
                id="youtube_music:mock1",
                source="youtube_music",
                source_id="mock1",
                title="Mock Song",
                artist="Mock Artist",
                duration=180,
            )
        ]

    async def search_artists(self, query: str, limit: int):
        return [{"id": "UCmock", "source": "youtube_music", "name": "Mock Artist", "photo": None}]

    async def resolve(self, source_id: str):
        from music_resolver.models import PlaybackInfo, ResolvedTrack, TrackInfo
        track = TrackInfo(
            id=f"youtube_music:{source_id}",
            source="youtube_music",
            source_id=source_id,
            title="Mock Song",
            artist="Mock Artist",
            duration=180,
        )
        playback = PlaybackInfo(type="proxy", url="https://example.com/audio.mp3", mime_type="audio/mp4")
        return ResolvedTrack(track=track, playback=playback)

    async def radio(self, video_id: str, limit: int):
        return []

    def can_handle_url(self, url: str) -> bool:
        return False


def test_api_health_and_public_routes():
    settings = load_settings()
    manager = ProviderManager([DummyProvider()], timeout=settings.provider_timeout)
    service = MusicService(manager, settings)
    app = create_app(settings=settings, service=service)
    client = TestClient(app)

    # 1. /health
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}

    # 2. /search
    resp = client.get("/search?q=test")
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert len(data["results"]) == 1
    assert data["results"][0]["title"] == "Mock Song"

    # 3. /artists
    resp = client.get("/artists?q=test")
    assert resp.status_code == 200
    assert len(resp.json()["results"]) == 1

    # 4. /plus/status
    resp = client.get("/plus/status")
    assert resp.status_code == 200
    assert "plus" in resp.json()

    # 5. /events
    resp = client.get("/events")
    assert resp.status_code == 200
    assert "events" in resp.json()


def test_api_resolve_and_not_found():
    settings = load_settings()
    manager = ProviderManager([DummyProvider()], timeout=settings.provider_timeout)
    service = MusicService(manager, settings)
    app = create_app(settings=settings, service=service)
    client = TestClient(app)

    resp = client.get("/resolve?id=youtube_music:mock1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["track"]["id"] == "youtube_music:mock1"
    assert data["track"]["title"] == "Mock Song"
    assert data["playback"]["url"] == "https://example.com/audio.mp3"

    # Missing ID returns 400
    resp_bad = client.get("/resolve?id=")
    assert resp_bad.status_code == 400

