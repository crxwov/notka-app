import pytest
from music_resolver.providers.youtube.mappers import (
    artist_name_and_id,
    best_thumbnail_url,
    length_to_seconds,
    map_album_track,
    map_search_item,
)
from music_resolver.providers.youtube.moods import MOODS, RU_MOOD_QUERIES


def test_youtube_artist_and_thumbnails():
    artists = [{"name": "Eminem", "id": "UC123"}, {"name": "Rihanna", "id": "UC456"}]
    name, artist_id = artist_name_and_id(artists)
    assert name == "Eminem, Rihanna"
    assert artist_id == "UC123"

    thumbs = [{"url": "https://img.yt/small.jpg"}, {"url": "https://img.yt/large.jpg"}]
    assert best_thumbnail_url(thumbs) == "https://img.yt/large.jpg"


def test_length_to_seconds():
    assert length_to_seconds("3:45") == 225
    assert length_to_seconds("1:02:10") == 3730
    assert length_to_seconds(None) is None


def test_map_search_item():
    item = {
        "videoId": "dQw4w9WgXcQ",
        "title": "Never Gonna Give You Up",
        "artists": [{"name": "Rick Astley", "id": "UCrick"}],
        "duration_seconds": 213,
        "thumbnails": [{"url": "https://img.yt/hq.jpg"}],
    }
    candidate = map_search_item(item)
    assert candidate is not None
    assert candidate.id == "youtube_music:dQw4w9WgXcQ"
    assert candidate.artist == "Rick Astley"
    assert candidate.duration == 213


def test_map_album_track():
    track = {
        "videoId": "abc123xyz89",
        "title": "Track One",
        "artists": [{"name": "Singer", "id": "UCsing"}],
        "duration_seconds": 180,
    }
    candidate = map_album_track(track, "Fallback Singer", "alb_id", "Album Name", fallback_artwork="cover.jpg")
    assert candidate is not None
    assert candidate.title == "Track One"
    assert candidate.artwork == "cover.jpg"
    assert candidate.album == "Album Name"


def test_mood_mappings():
    assert "chill" in MOODS
    assert "party" in MOODS
    assert "energize" in RU_MOOD_QUERIES
