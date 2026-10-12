"""python tests/cookies_test.py — cookies are used only when YouTube asks to sign in (no network)."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

DATA = Path(tempfile.mkdtemp())
os.environ["NOTKA_DATA_DIR"] = str(DATA)
os.environ.pop("YTDLP_COOKIE_FILE", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from music_resolver.providers import youtube_common as yc  # noqa: E402
from music_resolver.config import load_settings  # noqa: E402

fails = 0


def ok(cond, msg):
    global fails
    print(("PASS " if cond else "FAIL ") + msg)
    fails += 0 if cond else 1


class Boom(Exception):
    pass


ok(yc.needs_signin(Boom("ERROR: [youtube] x: Sign in to confirm you’re not a bot. Use --cookies")), "«not a bot» is a sign-in request")
ok(yc.needs_signin(Boom("Sign in to confirm your age")), "an age check is a sign-in request")
ok(not yc.needs_signin(Boom("HTTP Error 403: Forbidden")), "a plain 403 is not")
ok(not yc.needs_signin(Boom("Video unavailable")), "an unavailable video is not")

ok(yc.cookie_file_path() is None, "no cookie file -> none")
(DATA / "youtube-cookies.txt").write_text("# Netscape HTTP Cookie File\n" + ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\n" * 3)
ok(yc.cookie_file_path() == str(DATA / "youtube-cookies.txt"), "a file the owner sent is found at once, no restart")

settings = load_settings()
prov = yc.YouTubeProviderBase.__new__(yc.YouTubeProviderBase) if hasattr(yc, "YouTubeProviderBase") else None
cls = next((c for c in vars(yc).values() if isinstance(c, type) and hasattr(c, "_base_opts")), None)
if cls:
    p = cls.__new__(cls)
    p.settings = settings
    plain = p._base_opts(use_cookies=True)
    ok("cookiefile" not in plain, "an ordinary request does NOT carry the account cookies")
    forced = p._base_opts(use_cookies=True, force_file=True)
    ok(forced.get("cookiefile") == str(DATA / "youtube-cookies.txt"), "the cookies are added when forced (YouTube asked to sign in)")
else:
    ok(False, "provider class with _base_opts not found")

# the backup of the data folder never carries the cookies
src = Path(__file__).resolve().parent.parent.joinpath("run_server.py").read_text(encoding="utf-8")
ns = {}
exec("import time, uuid, tarfile\nfrom pathlib import Path\n" + src[src.index("def make_backup("): src.index("def send_file_to_owner(")], ns)
(DATA / "plus.json").write_text("{}")
import tarfile  # noqa: E402

out = ns["make_backup"](DATA, DATA.parent / ("bk" + DATA.name))
names = tarfile.open(out).getnames()
ok("data/plus.json" in names and not any("cookies" in n for n in names), "the daily copy has the data but not the cookies")
print("\n" + (f"{fails} FAILED" if fails else "all passed"))
sys.exit(1 if fails else 0)
