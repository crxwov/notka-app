"""Song lyrics for the player.

Sources, in this order:

0. NetEase Cloud Music — the only one with the time of every WORD
   (``words: true``, each line carries ``w: [[start, end, text], ...]``);
   used only when title, artist and length surely match.
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
    key = f"w2|{_norm(title)}|{_norm(artist)}|{round(duration or 0)}"  # w2: results may carry word timings
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


# ---- NetEase Cloud Music: the only open source that knows when each WORD is sung ("yrc").
# Used only when it is surely the same recording: title, artist and length agree. ----
_NETEASE_SEARCH = "https://music.163.com/api/search/get"
_NETEASE_LYRIC = "https://music.163.com/api/song/lyric"
_NETEASE_HEADERS = {"user-agent": "Mozilla/5.0", "referer": "https://music.163.com/"}
_YRC_LINE = re.compile(r"^\[(\d+),(\d+)\](.*)$")
_YRC_WORD = re.compile(r"\((\d+),(\d+),-?\d+\)")
# «作词：…», «Written by：…», «Producer：…»: the credits NetEase puts in front of the text (a full-width colon early in the line)
_CJK_CREDIT = re.compile(r"^[^:：]{1,30}[：]|^[一-鿿]+\s*:")


def parse_yrc(text: str) -> list[dict]:
    """Parse NetEase word-timed lyrics: ``[start_ms,dur_ms](start,dur,0)word (start,dur,0)word``."""
    lines: list[dict] = []
    for raw in text.splitlines():
        m = _YRC_LINE.match(raw.strip())
        if not m:
            continue  # the {"t":..,"c":[..]} credit lines
        body = m.group(3)
        marks = list(_YRC_WORD.finditer(body))
        words: list[list] = []
        for k, mark in enumerate(marks):
            end = marks[k + 1].start() if k + 1 < len(marks) else len(body)
            piece = body[mark.end():end]
            if not piece.strip():
                continue
            start = int(mark.group(1)) / 1000
            words.append([round(start, 2), round(start + int(mark.group(2)) / 1000, 2), piece])
        line_text = "".join(w[2] for w in words).strip()
        if not words or not line_text or _CJK_CREDIT.match(line_text):
            continue
        lines.append({"t": words[0][0], "text": line_text, "w": words})
    lines.sort(key=lambda line: line["t"])
    return lines


async def _from_netease(title: str, artist: str, duration: float | None) -> dict | None:
    names = _artist_names(artist)
    want_title = _norm(_clean_title(title))
    want_artists = [_norm(n) for n in names]
    if not want_title:
        return None
    query = f"{_clean_title(title)} {names[0] if names else ''}".strip()
    async with httpx.AsyncClient(timeout=8, headers=_NETEASE_HEADERS) as client:
        res = await client.post(_NETEASE_SEARCH, data={"s": query, "type": 1, "limit": 8, "offset": 0})
        if res.status_code != 200:
            return None
        songs = (res.json().get("result") or {}).get("songs") or []
        for song in songs:
            got_title = _norm(song.get("name") or "")
            if not got_title or not (got_title in want_title or want_title in got_title):
                continue
            got_artists = [_norm(a.get("name") or "") for a in (song.get("artists") or [])]
            if want_artists and not any(w and g and (w in g or g in w) for w in want_artists for g in got_artists):
                continue
            if duration and abs((song.get("duration") or 0) / 1000 - duration) > _SYNC_TOLERANCE_SECONDS:
                continue
            lyric = await client.get(_NETEASE_LYRIC, params={"id": song["id"], "lv": 1, "kv": 1, "tv": -1, "yv": 1})
            if lyric.status_code != 200:
                continue
            yrc = ((lyric.json().get("yrc") or {}).get("lyric")) or ""
            lines = parse_yrc(yrc) if yrc else []
            if len(lines) >= 3:
                return {"lines": lines, "synced": True, "words": True}
    return None


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


def _anchor_words(words_result: dict, lrclib_result: dict | None) -> dict:
    """Words of one source, line starts of the other.

    Two databases time the same song a few tenths of a second apart. When the line-synced text is
    there too, each word-timed line is moved so that it starts where the line-synced one does (the
    words inside it keep their own real timings); a line the other has no match for moves by the
    typical difference. Without a line-synced text, or when the texts do not match, nothing moves.
    """
    anchors = [line for line in (lrclib_result or {}).get("lines", []) if line.get("t") is not None] if (lrclib_result or {}).get("synced") else []
    if not anchors:
        return words_result
    by_text: dict[str, list[float]] = {}
    for line in anchors:
        by_text.setdefault(_norm(line["text"]), []).append(line["t"])
    deltas: list[float | None] = []
    for line in words_result["lines"]:
        near = [t for t in by_text.get(_norm(line["text"]), []) if abs(t - line["t"]) <= 3.0]
        deltas.append(min(near, key=lambda t: abs(t - line["t"])) - line["t"] if near else None)
    known = sorted(d for d in deltas if d is not None)
    if len(known) < 3:
        return words_result
    typical = known[len(known) // 2]
    if abs(typical) > 2.0:
        return words_result
    lines = []
    for line, delta in zip(words_result["lines"], deltas):
        shift = typical if delta is None else delta
        lines.append({
            "t": round(line["t"] + shift, 2),
            "text": line["text"],
            "w": [[round(a + shift, 2), round(b + shift, 2), text] for a, b, text in line["w"]],
        })
    lines.sort(key=lambda line: line["t"])
    return {"lines": lines, "synced": True, "words": True}


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

    # the line-synced text and the word-timed one are asked together; the word-timed one wins when found
    lrclib_result, netease_result = await asyncio.gather(
        _from_lrclib(title, artist, duration), _from_netease(title, artist, duration), return_exceptions=True
    )
    lrclib_ok = lrclib_result if isinstance(lrclib_result, dict) else None
    netease_ok = netease_result if isinstance(netease_result, dict) else None
    result: dict | None = lrclib_ok
    if netease_ok:
        result = _anchor_words(netease_ok, lrclib_ok)
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
