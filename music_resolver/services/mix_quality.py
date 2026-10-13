"""What is allowed into a mix at all.

YouTube's radio happily plays piano covers, nursery rhymes and a stranger's diss track next to the real
songs. The mix is Нотка's own thing, so every candidate goes through this gate first:

* the title says it is not the song itself (a cover, «на пианино + ноты», karaoke, a tutorial, a «type beat»,
  nursery rhymes, a diss track, a reaction, «8D», slowed / sped up);
* the artist is a channel that makes such things («Piano …», «… Beats», «… Rhymes», «Kids …», an orchestra
  that plays covers);
* the length is not a song's (under 45 seconds, over nine minutes);
* the artist is not a real one: fewer than ``MIN_LISTENERS`` listeners. The artists the listener already has
  are let through whatever their size: a small band they love is theirs.

The functions are plain and take the YouTube Music client as an argument, so they are easy to test.
"""

import re
import time
from concurrent.futures import ThreadPoolExecutor

from music_resolver.services.originals import parse_subscribers

MIN_LISTENERS = 40_000
MIN_SECONDS = 45
MAX_SECONDS = 9 * 60

_TITLE_JUNK = re.compile(
    r"\b(cover|кавер|karaoke|караоке|tutorial|туториал|type\s*beat|instrumental|инструментал|minus|минус|"
    r"8d|nightcore|slowed|sped\s*up|speed\s*up|reverb|bass\s*boost(ed)?|reaction|реакция|diss+|дисс?|"
    r"nursery|rhymes?|lullab(y|ies)|колыбельн\w*|для\s+детей|детск\w+|kids?|baby|cocomelon|"
    r"на\s+пианино|на\s+гитаре|на\s+синтезатор\w*|piano\s*(version|cover|tutorial)|"
    r"ноты|сборник|mashup|мэшап|megamix|1\s*hour|10\s*hours?|час\s+музыки|official\s+audio\s+lyrics?)\b",
    re.I,
)
_ARTIST_JUNK = re.compile(
    r"\b(piano|pianist|guitar\s*cover|instrumental|beats?|karaoke|rhymes?|kids?|children|nursery|lullab\w*|"
    r"cover\s*band|orchestra|string\s+quartet|vitamin\s+string|tribute|8d|nightcore|type\s*beat|"
    r"пианино|кавер|караоке|детские|для\s+детей)\b",
    re.I,
)
_listeners_cache: dict[str, tuple[float, int | None]] = {}
_CACHE_TTL = 24 * 3600


def title_ok(title: str) -> bool:
    return not _TITLE_JUNK.search(title or "")


def artist_ok(artist: str) -> bool:
    return not _ARTIST_JUNK.search(artist or "")


def duration_ok(seconds: int | None) -> bool:
    if not seconds:
        return True  # unknown: not a reason to drop
    return MIN_SECONDS <= int(seconds) <= MAX_SECONDS


def _listeners(client, artist_id: str | None) -> int | None:
    """Listeners of an artist (cached for a day). None when it cannot be told."""
    if not artist_id:
        return None
    now = time.time()
    hit = _listeners_cache.get(artist_id)
    if hit and now - hit[0] < _CACHE_TTL:
        return hit[1]
    value = None
    try:
        page = client.get_artist(artist_id) or {}
        value = parse_subscribers(page.get("subscribers"))
        if value is None:
            value = 0 if page else None
    except Exception:  # noqa: BLE001
        return None
    _listeners_cache[artist_id] = (now, value)
    return value


def _names(artist: str) -> set[str]:
    return {p.strip().lower() for p in re.split(r",|&| feat\.? | x ", artist or "") if p.strip()}


def filter_tracks(client, tracks: list, known_artists: set[str] | None = None, budget: float = 7.0) -> list:
    """The tracks that pass the gate; order kept. ``known_artists`` are lower-case names the listener has."""
    known = {a.lower() for a in (known_artists or set())}
    kept = [t for t in tracks if title_ok(t.title) and artist_ok(t.artist) and duration_ok(t.duration)]
    # artists to look up: not known to the listener, not cached yet
    need: dict[str, str] = {}
    for t in kept:
        if _names(t.artist) & known:
            continue
        aid = getattr(t, "artist_id", None)
        if aid and aid not in need:
            hit = _listeners_cache.get(aid)
            if not hit or time.time() - hit[0] >= _CACHE_TTL:
                need[aid] = t.artist
    if need:
        deadline = time.time() + budget
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = {aid: pool.submit(_listeners, client, aid) for aid in list(need)[:30]}
            for aid, fut in futures.items():
                try:
                    fut.result(timeout=max(0.1, deadline - time.time()))
                except Exception:  # noqa: BLE001
                    pass
    out = []
    for t in kept:
        if _names(t.artist) & known:
            out.append(t)
            continue
        aid = getattr(t, "artist_id", None)
        hit = _listeners_cache.get(aid) if aid else None
        count = hit[1] if hit else None
        if count is None:
            out.append(t)  # could not be told in time: a doubt is not a reason
        elif count >= MIN_LISTENERS:
            out.append(t)
    return out
