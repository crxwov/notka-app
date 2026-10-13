import os
import tempfile
from pathlib import Path
import pytest

from music_resolver.services.matcher import normalize_text, rank_candidates, tokens
from music_resolver.models import TrackCandidate


def test_matcher_normalize_and_tokens():
    norm = normalize_text("  The  Weeknd - Blinding Lights! ")
    assert "weeknd" in norm
    assert "blinding" in norm
    toks = tokens("Travis Scott (feat. Drake)")
    assert "travis" in toks
    assert "scott" in toks


def test_matcher_rank_candidates():
    query = "The Weeknd Blinding Lights"
    c1 = TrackCandidate(
        id="c1",
        source="itunes",
        source_id="1",
        title="Blinding Lights",
        artist="The Weeknd",
        duration=200,
    )
    c2 = TrackCandidate(
        id="c2",
        source="itunes",
        source_id="2",
        title="Some Other Song",
        artist="Someone Else",
        duration=200,
    )
    ranked = rank_candidates(query, [c2, c1])
    assert ranked[0].id == "c1"
    assert ranked[0].confidence > 0.5


def test_auth_store_code_generation_and_verification():
    os.environ["NOTKA_DATA_DIR"] = tempfile.mkdtemp()
    from music_resolver.services import auth_store

    code = auth_store.generate_code_for_user(12345, "testuser", "Tester")
    assert len(code) == 6

    # Verify invalid code
    bad = auth_store.verify_code("testuser", "000000")
    assert not bad.get("ok")

    # Verify valid code
    good = auth_store.verify_code("testuser", code)
    assert good.get("ok")
    assert "token" in good
    token = good["token"]

    user_id = auth_store.resolve_user_id(x_auth_token=token)
    assert user_id == 12345


def test_plus_store_status_and_codes():
    temp_dir = Path(tempfile.mkdtemp())
    from music_resolver.services import plus_store
    plus_store._FILE = temp_dir / "plus.json"
    plus_store.DATA_DIR = temp_dir

    status = plus_store.status(99999)
    assert status["plus"] is False

    # Grant 7 days
    res = plus_store.grant(99999, 7, via="test")
    assert res["plus"] is True
    assert plus_store.status(99999)["plus"] is True
