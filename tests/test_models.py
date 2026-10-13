import pytest
from music_resolver.models import (
    AlbumInfo,
    AlbumResponse,
    AlbumSummary,
    ArtistInfo,
    ArtistResponse,
    PlaybackInfo,
    ResolvedTrack,
    ResolveResponse,
    SearchResponse,
    TrackCandidate,
    candidate_to_track,
    public_track_id,
)


def test_public_track_id():
    assert public_track_id("itunes", "12345") == "itunes:12345"
    assert public_track_id("youtube_music", "dQw4w9WgXcQ") == "youtube_music:dQw4w9WgXcQ"


def test_track_candidate_to_track():
    candidate = TrackCandidate(
        id="itunes:1001",
        source="itunes",
        source_id="1001",
        title="Song Title",
        artist="Artist Name",
        duration=210,
        artwork="https://example.com/art.jpg",
        album="Greatest Hits",
        album_id="500",
        artist_id="200",
    )
    track = candidate_to_track(candidate)
    assert track.id == "itunes:1001"
    assert track.source == "itunes"
    assert track.title == "Song Title"
    assert track.artist == "Artist Name"
    assert track.duration == 210
    assert track.artwork == "https://example.com/art.jpg"
    assert track.album == "Greatest Hits"


def test_resolve_response():
    candidate = TrackCandidate(
        id="youtube_music:abc",
        source="youtube_music",
        source_id="abc",
        title="Test Song",
        artist="Tester",
        duration=180,
    )
    track = candidate_to_track(candidate)
    playback = PlaybackInfo(type="url", url="https://googlevideo.com/stream", mime_type="audio/mp4")
    resp = ResolveResponse(track=track, playback=playback)

    assert resp.track.title == "Test Song"
    assert resp.playback.url == "https://googlevideo.com/stream"
    assert resp.playback.mime_type == "audio/mp4"


def test_album_and_artist_info():
    album = AlbumInfo(
        id="alb1",
        source="itunes",
        title="Album One",
        artist="Musician",
        year="2024",
        tracks=[],
    )
    assert album.id == "alb1"
    assert album.title == "Album One"

    artist = ArtistInfo(
        id="art1",
        source="itunes",
        name="Musician",
        top_tracks=[],
        albums=[],
    )
    assert artist.name == "Musician"
