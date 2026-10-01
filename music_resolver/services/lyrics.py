"""Song lyrics for the player.

Two sources, in this order:

1. LRCLIB (lrclib.net) — an open lyrics database, searched by title and
   artist, so it works for a track from any of our sources. Most of its
   entries are synced (a timestamp per line).
2. YouTube Music's own lyrics — only for tracks that are YouTube Music
   videos, when LRCLIB has nothing.

Lines come back as ``{"t": seconds | None, "text": str}``; ``synced`` says
whether the timestamps can be trusted for highlighting the current line.
"""

import asyncio
import hashlib
import json
import re
import time
from pathlib import Path

import httpx

_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "cache" / "lyrics"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_LRCLIB_SEARCH = "https://lrclib.net/api/search"
_USER_AGENT = "Notka/1.0 (Telegram Mini App)"

# A synced text is only as good as its timing: a version of the song that
# is longer or shorter than ours by more than this drifts off the music,
# so it is shown as plain text instead.
_SYNC_TOLERANCE_SECONDS = 3.0

# "Nothing found" is remembered for a while (in memory only), so a track
# without lyrics doesn't hit the sources again on every replay.
_MISS_TTL_SECONDS = 6 * 3600
_misses: dict[str, float] = {}

_EMPTY = {"lines": [], "synced": False}

_LRC_TIME = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
# "(feat. X)", "[Remastered 2011]", " - Single Version" — noise that the
# lyrics database doesn't carry in its titles.
_TITLE_NOISE = re.compile(r"\s*[\(\[][^\)\]]*[\)\]]|\s+[-–—]\s+.*$")


def _clean_title(title: str) -> str:
    cleaned = _TITLE_NOISE.sub("", title).strip()
    return cleaned or title.strip()


def _artist_names(artist: str) -> list[str]:
    """Split "A, B feat. C" into its artists: sources join several of them differently."""
    parts = re.split(r"\s*(?:,|&|;|/|\bfeat\.?|\bft\.?)\s*", artist, flags=re.IGNORECASE)
    return [part for part in (p.strip() for p in parts) if part]


def _norm(text: str) -> str:
    return re.sub(r"[^\w]+", "", text.lower().replace("ё", "е"))


def _cache_path(title: str, artist: str, duration: float | None) -> Path:
    key = f"{_norm(title)}|{_norm(artist)}|{round(duration or 0)}"
    return _CACHE_DIR / (hashlib.sha1(key.encode("utf-8")).hexdigest() + ".json")


def parse_lrc(text: str) -> list[dict]:
    """Parse LRC text ("[01:23.45] line") into lines sorted by time."""
    lines: list[dict] = []
    for raw in text.splitlines():
        stamps = list(_LRC_TIME.finditer(raw))
        if not stamps:
            continue
        body = raw[stamps[-1].end():].strip()
        if not body:
            continue
        for m in stamps:
            fraction = m.group(3) or "0"
            seconds = int(m.group(1)) * 60 + int(m.group(2)) + int(fraction) / (10 ** len(fraction))
            lines.append({"t": round(seconds, 2), "text": body})
    lines.sort(key=lambda line: line["t"])
    return lines


def _plain_lines(text: str) -> list[dict]:
    out: list[dict] = []
    for raw in text.splitlines():
        line = raw.strip()
        # one blank line between verses is kept as a gap
        if line or (out and out[-1]["text"]):
            out.append({"t": None, "text": line})
    while out and not out[-1]["text"]:
        out.pop()
    return out


def _pick_lrclib(items: list[dict], title: str, artist: str, duration: float | None) -> dict | None:
    want_title = _norm(title)
    want_artists = [_norm(name) for name in _artist_names(artist)]
    best: tuple[float, dict] | None = None
    for item in items:
        if item.get("instrumental"):
            continue
        got_title = _norm(item.get("trackName") or "")
        got_artist = _norm(item.get("artistName") or "")
        if not got_title or not (got_title in want_title or want_title in got_title):
            continue
        if want_artists and got_artist and not any(name and (name in got_artist or got_artist in name) for name in want_artists):
            continue
        synced_text = item.get("syncedLyrics")
        plain_text = item.get("plainLyrics")
        if not synced_text and not plain_text:
            continue
        delta = abs((item.get("duration") or 0) - duration) if duration else 0.0
        usable_sync = bool(synced_text) and delta <= _SYNC_TOLERANCE_SECONDS
        # synced and in time first, then the closest length
        score = delta + (0 if usable_sync else 1000)
        if best is None or score < best[0]:
            if usable_sync:
                result = {"lines": parse_lrc(synced_text), "synced": True}
            else:
                result = {"lines": _plain_lines(plain_text or re.sub(_LRC_TIME, "", synced_text or "")), "synced": False}
            if result["lines"]:
                best = (score, result)
    return best[1] if best else None


async def _from_lrclib(title: str, artist: str, duration: float | None) -> dict | None:
    params = {"track_name": _clean_title(title)}
    names = _artist_names(artist)
    if names:
        params["artist_name"] = names[0]
    async with httpx.AsyncClient(timeout=10, headers={"user-agent": _USER_AGENT}) as client:
        for attempt in range(2):  # the public server answers 503 when busy
            res = await client.get(_LRCLIB_SEARCH, params=params)
            if res.status_code == 503 and attempt == 0:
                await asyncio.sleep(0.8)
                continue
            break
    if res.status_code != 200:
        return None
    items = res.json()
    return _pick_lrclib(items, _clean_title(title), artist, duration) if isinstance(items, list) else None


def _from_youtube_music_sync(provider, video_id: str) -> dict | None:
    client = provider._client()
    browse_id = (client.get_watch_playlist(videoId=video_id) or {}).get("lyrics")
    if not browse_id:
        return None
    raw = client.get_lyrics(browse_id, timestamps=True) or {}
    lyrics = raw.get("lyrics")
    if raw.get("hasTimestamps") and isinstance(lyrics, list):
        lines = [
            {"t": round(line.start_time / 1000, 2), "text": line.text.strip()}
            for line in lyrics
            if line.text and line.text.strip()
        ]
        return {"lines": lines, "synced": True} if lines else None
    if isinstance(lyrics, str) and lyrics.strip():
        return {"lines": _plain_lines(lyrics), "synced": False}
    return None


async def find_lyrics(
    title: str,
    artist: str,
    duration: float | None,
    youtube_music_provider=None,
    video_id: str | None = None,
) -> dict:
    path = _cache_path(title, artist, duration)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            path.unlink(missing_ok=True)
    if _misses.get(path.name, 0) > time.time():
        return _EMPTY

    result: dict | None = None
    try:
        result = await _from_lrclib(title, artist, duration)
    except (httpx.HTTPError, ValueError):
        result = None
    if result is None and youtube_music_provider is not None and video_id:
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(_from_youtube_music_sync, youtube_music_provider, video_id), timeout=12
            )
        except Exception:
            result = None

    if result is None:
        _misses[path.name] = time.time() + _MISS_TTL_SECONDS
        return _EMPTY
    try:
        path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    return result
