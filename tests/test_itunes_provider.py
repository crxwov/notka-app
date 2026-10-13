import pytest
from music_resolver.providers.itunes.matcher import (
    artist_matches,
    duration_close,
    leading_artist_prefix_clause,
    looks_unofficial,
    strip_leading_artist_prefix,
    strip_title_extras,
    title_matches,
    user_upload_title_matches,
)
from music_resolver.providers.itunes.parser import artwork, dedupe_albums, duration_seconds, map_track


def test_strip_title_extras():
    assert strip_title_extras("Song Name (feat. Drake)").strip() == "Song Name"
    assert strip_title_extras("Another Song [Official Video]").strip() == "Another Song"
    assert strip_title_extras("Track (Radio Edit)").strip() == "Track"


def test_leading_artist_prefix():
    clause = leading_artist_prefix_clause("Travis Scott - FE!N", "Travis Scott")
    assert clause is not None
    stripped = strip_leading_artist_prefix("Travis Scott - FE!N", "Travis Scott")
    assert stripped == "FE!N"


def test_title_and_artist_matches():
    assert title_matches("LOOOVE", "Travis Scott - LOOOVE (Lyrics)", "Travis Scott")
    assert artist_matches("Travis Scott", "Travis Scott - LOOOVE", "Cactus Jack")
    assert not artist_matches("Travis Scott", "8-Bit Arcade - LOOOVE", "8-Bit Arcade")


def test_looks_unofficial():
    assert looks_unofficial("FE!N (Travis Scott Vocal Remix)", "Lakee", "FE!N")
    assert looks_unofficial("Song (8-Bit Version)", "Artist", "Song")
    assert not looks_unofficial("Standard Official Song", "Artist", "Standard Official Song")


def test_duration_close():
    assert duration_close(200, 203, tolerance=5, required=True)
    assert not duration_close(200, 210, tolerance=5, required=True)


def test_artwork_and_duration_helpers():
    entry = {"artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg"}
    assert artwork(entry) == "https://is1-ssl.mzstatic.com/image/thumb/Music/600x600bb.jpg"
    assert duration_seconds(185000) == 185


def test_dedupe_albums():
    raw = [
        {"collectionName": "Album Deluxe", "collectionId": 1, "releaseDate": "2024-01-01"},
        {"collectionName": "Album Deluxe", "collectionId": 2, "releaseDate": "2023-01-01"},
    ]
    deduped = dedupe_albums(raw)
    assert len(deduped) == 1
    assert deduped[0].id == "2"
