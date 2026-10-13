r"""The events store: ten days, one task a day, rewards by points, days of Плюс, the numbered edition.

    pytest tests/events_store_test.py
"""
import os
import sys
import tempfile
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

def test_events_store_flow():
    os.environ["NOTKA_DATA_DIR"] = tempfile.mkdtemp()
    os.environ["NOTKA_FAKE_NOW"] = "2026-10-22"

    from music_resolver.services import events_store as ev

    granted = []

    def grant(user_id, days, via):
        granted.append((user_id, days))
        return {"plus": True, "until": 1_900_000_000 + days}

    FULL = {"t1": 10, "t2": 1, "t3": 1, "t4": 3, "t5": 1, "t6": 5, "t7": 3, "t8": 3, "t9": 3, "t10": 30}
    pub = ev.public(None)[0]
    assert pub["status"] == "active" and pub["dayNow"] == 1
    assert pub["tasks"][0].get("title") and all(t.get("locked") and "title" not in t for t in pub["tasks"][1:])
    assert "mine" not in pub

    r = ev.sync(1, "halloween", FULL, grant)
    assert r["points"] == 1 and set(r["progress"]) == {"t1"}
    for _ in range(2):
        ev.advance_day()
    r = ev.sync(1, "halloween", FULL, grant)
    assert r["points"] == 3 and r["items"] == ["atmo_halloween"]
    assert granted == [] and r["plusUntil"] is None
    ev.advance_day()
    ev.advance_day()
    r = ev.sync(1, "halloween", FULL, grant)
    assert r["points"] == 5 and "plus_3" in r["items"] and granted == [(1, 3)]
    assert r["plusUntil"] == 1_900_000_003
    r = ev.sync(1, "halloween", {"t1": 0}, grant)
    assert r["points"] == 5
    r = ev.sync(1, "halloween", {"t2": 99}, grant)
    assert r["progress"]["t2"] == 1
    r = ev.sync(1, "halloween", FULL, grant)
    assert granted == [(1, 3)]
    for _ in range(5):
        ev.advance_day()
    assert ev.public(1)[0]["dayNow"] == 10 and not any(t.get("locked") for t in ev.public(1)[0]["tasks"])
    r = ev.sync(1, "halloween", FULL, grant)
    assert r["points"] == 10 and "plus_10" in r["items"] and (1, 10) in granted
    assert "plus_10" in ev.public(1)[0]["mine"]["items"]

    r = ev.sync(300, "halloween", FULL, None)
    assert "plus_3" not in r["items"] and "atmo_halloween" in r["items"]

    ev.reset(1, "halloween")
    assert ev.public(1)[0]["mine"]["items"] == [] and ev.public(1)[0]["dayNow"] == 1

    os.environ["NOTKA_FAKE_NOW"] = "2026-11-05"
    r = ev.sync(500, "halloween", FULL, grant)
    assert r["points"] == 0 and r["items"] == []
    assert ev.public(None)[0]["status"] == "ended"
    os.environ["NOTKA_FAKE_NOW"] = ""
    with pytest.raises(PermissionError):
        ev.reset(1, "halloween")
    with pytest.raises(PermissionError):
        ev.advance_day()
    os.environ["NOTKA_FAKE_NOW"] = "2026-10-22"
    with pytest.raises(KeyError):
        ev.sync(1, "nope", {}, grant)
