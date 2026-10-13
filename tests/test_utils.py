from music_resolver.utils.ids import parse_public_id
from music_resolver.utils.logging import configure_logging, log_provider_result


def test_parse_public_id_valid():
    res = parse_public_id("youtube_music:abcdef12345")
    assert res is not None
    source, source_id = res
    assert source == "youtube_music"
    assert source_id == "abcdef12345"


def test_parse_public_id_invalid():
    assert parse_public_id("") is None
    assert parse_public_id("nosource") is None
    assert parse_public_id("source:") is None
    assert parse_public_id(":source_id") is None


def test_configure_logging():
    configure_logging("DEBUG")
    log_provider_result("search", "itunes", 120, True, False, query="test")
