r"""The events store: ten days, one task a day, rewards by points, days of Плюс, the numbered edition.

    venv\Scripts\python tests\events_store_test.py
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["NOTKA_DATA_DIR"] = tempfile.mkdtemp()
os.environ["NOTKA_FAKE_NOW"] = "2026-10-22"

from music_resolver.services import events_store as ev  # noqa: E402

failed = 0
granted = []


def check(name, ok, extra=""):
    global failed
    failed += 0 if ok else 1
    print("PASS" if ok else "FAIL", name, extra)


def grant(user_id, days, via):
    granted.append((user_id, days))
    return {"plus": True, "until": 1_900_000_000 + days}


FULL = {"t1": 10, "t2": 1, "t3": 1, "t4": 3, "t5": 1, "t6": 5, "t7": 3, "t8": 3, "t9": 3, "t10": 30}
pub = ev.public(None)[0]
check("the event is active, on day 1", pub["status"] == "active" and pub["dayNow"] == 1, str(pub["dayNow"]))
check("only today's task is shown, the rest are days on a calendar", pub["tasks"][0].get("title") and all(t.get("locked") and "title" not in t for t in pub["tasks"][1:]))
check("the edition has a limit of 100", pub["editionLeft"] == 100)
check("a stranger gets no «mine»", "mine" not in pub)

r = ev.sync(1, "halloween", FULL, grant)
check("a task that has not opened does not count", r["points"] == 1 and set(r["progress"]) == {"t1"}, str(r["progress"]))
for _ in range(2):
    ev.advance_day()
r = ev.sync(1, "halloween", FULL, grant)
check("on day 3 the first three are earned: the theme opens", r["points"] == 3 and r["items"] == ["atmo_halloween"], str(r["items"]))
check("and nothing more yet", granted == [] and r["plusUntil"] is None)
ev.advance_day()
ev.advance_day()
r = ev.sync(1, "halloween", FULL, grant)
check("on day 5, five points give three days of Плюс", r["points"] == 5 and "plus_3" in r["items"] and granted == [(1, 3)], str(granted))
check("and the answer says until when", r["plusUntil"] == 1_900_000_003)
r = ev.sync(1, "halloween", {"t1": 0}, grant)
check("progress never goes back", r["points"] == 5)
r = ev.sync(1, "halloween", {"t2": 99}, grant)
check("a task is capped at its target", r["progress"]["t2"] == 1)
r = ev.sync(1, "halloween", FULL, grant)
check("asking again gives nothing twice", granted == [(1, 3)])
for _ in range(5):
    ev.advance_day()
check("on day 10 everything is open", ev.public(1)[0]["dayNow"] == 10 and not any(t.get("locked") for t in ev.public(1)[0]["tasks"]))
r = ev.sync(1, "halloween", FULL, grant)
check("ten points: ten more days of Плюс, and the edition number 1", r["points"] == 10 and "plus_10" in r["items"] and r["edition"] == 1 and (1, 10) in granted, str(r["items"]))
check("«mine» shows in the list", ev.public(1)[0]["mine"]["edition"] == 1)

for uid in range(2, 101):
    ev.sync(uid, "halloween", FULL, grant)
check("a hundred editions are given", ev.public(None)[0]["editionLeft"] == 0)
r = ev.sync(101, "halloween", FULL, grant)
check("the hundred-and-first gets the days but no edition", "plus_10" in r["items"] and r["edition"] is None and "edition_halloween" not in r["items"], str(r["items"]))
check("the numbers are in order", ev.sync(37, "halloween", {}, grant)["edition"] == 37)
r = ev.sync(300, "halloween", FULL, None)
check("without a way to give days, the days wait", "plus_3" not in r["items"] and "atmo_halloween" in r["items"])

ev.reset(1, "halloween")
check("a reset forgets the listener, frees the number and puts the day back", ev.public(1)[0]["mine"]["items"] == [] and ev.public(1)[0]["dayNow"] == 1 and ev.public(None)[0]["editionLeft"] == 1)

os.environ["NOTKA_FAKE_NOW"] = "2026-11-05"
r = ev.sync(500, "halloween", FULL, grant)
check("after the end nothing is earned", r["points"] == 0 and r["items"] == [])
check("the event is ended", ev.public(None)[0]["status"] == "ended")
os.environ["NOTKA_FAKE_NOW"] = ""
try:
    ev.reset(1, "halloween")
    check("a reset is refused outside a preview", False)
except PermissionError:
    check("a reset is refused outside a preview", True)
try:
    ev.advance_day()
    check("moving a day is refused outside a preview", False)
except PermissionError:
    check("moving a day is refused outside a preview", True)
os.environ["NOTKA_FAKE_NOW"] = "2026-10-22"
try:
    ev.sync(1, "nope", {}, grant)
    check("an unknown event is refused", False)
except KeyError:
    check("an unknown event is refused", True)
sys.exit(1 if failed else 0)
