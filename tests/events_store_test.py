r"""The events store: rewards by points, numbered edition, nothing goes backwards.

    venv\Scripts\python tests\events_store_test.py
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["NOTKA_DATA_DIR"] = tempfile.mkdtemp()
os.environ["NOTKA_FAKE_NOW"] = "2026-10-20"

from music_resolver.services import events_store as ev  # noqa: E402

failed = 0


def check(name, ok, extra=""):
    global failed
    failed += 0 if ok else 1
    print("PASS" if ok else "FAIL", name, extra)


FULL = {"listen": 15, "bats": 3, "mood": 1, "share": 1}
public = ev.public(None)[0]
check("the event is active with days left", public["status"] == "active" and public["days"] > 0, str(public["days"]))
check("the edition has a limit of 100", public["editionLeft"] == 100)
check("a stranger gets no «mine»", "mine" not in public)

r = ev.sync(1, "halloween", {"listen": 15, "bats": 3})
check("two tasks open the frame", r["points"] == 2 and r["items"] == ["frame_pumpkin"], str(r))
r = ev.sync(1, "halloween", {"mood": 1})
check("three open the theme", r["points"] == 3 and "atmo_halloween" in r["items"] and r["edition"] is None)
r = ev.sync(1, "halloween", {"listen": 0, "bats": 0})
check("progress never goes back", r["points"] == 3)
r = ev.sync(1, "halloween", {"share": 1, "bats": 99})
check("four open the edition, and it is number 1", r["points"] == 4 and r["edition"] == 1 and "edition_halloween" in r["items"], str(r))
check("a task is capped at its target", r["progress"]["bats"] == 3)
r2 = ev.sync(1, "halloween", FULL)
check("asking again changes nothing", r2["edition"] == 1 and r2["items"].count("edition_halloween") == 1)
check("«mine» shows in the list", ev.public(1)[0]["mine"]["edition"] == 1)

for uid in range(2, 101):
    ev.sync(uid, "halloween", FULL)
check("a hundred editions are given", ev.public(None)[0]["editionLeft"] == 0)
r = ev.sync(101, "halloween", FULL)
check("the hundred-and-first gets the theme but no edition", "atmo_halloween" in r["items"] and r["edition"] is None and "edition_halloween" not in r["items"], str(r))
check("the numbers are in order", ev.sync(37, "halloween", {})["edition"] == 37)

os.environ["NOTKA_FAKE_NOW"] = "2026-11-05"
r = ev.sync(500, "halloween", FULL)
check("after the end nothing is earned", r["points"] == 0 and r["items"] == [])
check("the event is ended", ev.public(None)[0]["status"] == "ended")
try:
    ev.sync(1, "nope", {})
    check("an unknown event is refused", False)
except KeyError:
    check("an unknown event is refused", True)
sys.exit(1 if failed else 0)
