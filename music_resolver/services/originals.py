"""The original of a saved track that is a remake of it.

While the search went through a proxy that hides the big labels' releases, people saved the fan
remakes that were shown instead («Not Like Us» by a nobody, not by Kendrick Lamar). The saved
track keeps its old id, so it stays a remake for good. This looks for the real one.

A replacement is proposed only when everything agrees:
  * the saved title is a plain title, not a deliberate variant (remix, sped up, cover, live…);
  * a result of the same title (parentheses and «feat.» ignored) is by another artist (the length
    may differ: a remake is often a quarter shorter or longer);
  * that artist is a real one: many times more subscribers than the one it replaces, and at least
    a hundred thousand.
If two comparably big artists have a song of that name, nothing is proposed. Anything else is left
alone: a remix is never swapped. The listener still sees the list and confirms it in the app.
"""

import re
import time
from concurrent.futures import ThreadPoolExecutor

from music_resolver.models import candidate_to_track

MIN_SUBSCRIBERS = 100_000
RATIO = 15  # the original's artist is at least this many times bigger
MAX_TRACKS = 15

# a title that says it is a variant on purpose: such a track is never replaced
_VARIANT = re.compile(
    r"remix|re-?work|sped|slowed|reverb|speed|cover|karaoke|instrumental|piano|acoustic|\blive\b|"
    r"nightcore|lo-?fi|mash-?up|\bedit\b|version|\b8d\b|bass|tribute|originally|vocal|demo|session|"
    r"stripped|extended|club|dance|\bmix\b|bootleg|flip|ремикс|кавер|караоке|инструментал|"
    r"минус|на пианино|перепев|версия|slow|fast|mashup|\bvip\b|\bdub\b",
    re.I,
)
_BRACKETS = re.compile(r"\s*[\(\[].*?[\)\]]")
_FEAT = re.compile(r"\s*[-–—]?\s*\b(feat|ft)\b\.?.*$", re.I)
_SUBS = re.compile(r"([\d]+(?:[.,]\d+)?)\s*(k|m|b|тыс|млн|млрд)?", re.I)

_subs_cache: dict[str, tuple[float, int | None]] = {}
_SUBS_TTL = 24 * 3600


def _norm(text: str) -> str:
    return re.sub(r"[^\w]+", " ", (text or "").lower().replace("ё", "е")).strip()


def base_title(title: str) -> str:
    cleaned = _FEAT.sub("", _BRACKETS.sub("", title or "")).strip()
    return _norm(cleaned)


def is_variant(title: str) -> bool:
    return bool(_VARIANT.search(title or ""))


def parse_subscribers(text: str | None) -> int | None:
    """«1.34M subscribers», «523K», «12,3 тыс. подписчиков» → a number."""
    if not text:
        return None
    m = _SUBS.search(str(text))
    if not m:
        return None
    value = float(m.group(1).replace(",", "."))
    unit = (m.group(2) or "").lower()
    factor = {"k": 1e3, "тыс": 1e3, "m": 1e6, "млн": 1e6, "b": 1e9, "млрд": 1e9}.get(unit, 1)
    return int(value * factor)


def _subscribers(client, artist_id: str | None) -> int | None:
    if not artist_id:
        return None
    now = time.time()
    hit = _subs_cache.get(artist_id)
    if hit and now - hit[0] < _SUBS_TTL:
        return hit[1]
    value = None
    try:
        page = client.get_artist(artist_id) or {}
        value = parse_subscribers(page.get("subscribers"))
    except Exception:  # noqa: BLE001 - an artist page that does not open is simply unknown
        value = None
    _subs_cache[artist_id] = (now, value)
    return value


_name_cache: dict[str, tuple[float, int]] = {}


def _saved_artist_subscribers(client, track: dict) -> int | None:
    """How big the saved track's artist is. A remake's author often has no artist page at all
    (no id): then the name is looked up, and only an artist that really is not there counts as 0."""
    artist_id = track.get("artistId")
    if artist_id:
        return _subscribers(client, artist_id)
    name = _norm(str(track.get("artist") or ""))
    if not name:
        return None
    now = time.time()
    hit = _name_cache.get(name)
    if hit and now - hit[0] < _SUBS_TTL:
        return hit[1]
    best = 0
    try:
        for found in client.search(str(track.get("artist")), filter="artists", limit=5) or []:
            if _norm(found.get("artist") or found.get("title") or "") != name:
                continue
            subs = parse_subscribers(found.get("subscribers")) or _subscribers(client, found.get("browseId"))
            best = max(best, subs or 0)
    except Exception:  # noqa: BLE001
        return None
    _name_cache[name] = (now, best)
    return best


def _artist_names(item_artists) -> list[str]:
    return [_norm(a.get("name", "")) for a in (item_artists or []) if isinstance(a, dict)]


def _same_artist(saved_artist: str, names: list[str]) -> bool:
    saved = _norm(saved_artist)
    if not saved:
        return False
    parts = [p for p in re.split(r"\s+(?:и|and|&|feat|ft|x)\s+|,", saved) if p] or [saved]
    for name in names:
        if not name:
            continue
        if name in saved or saved in name or any(p and (p in name or name in p) for p in parts):
            return True
    return False


def _one(client, track: dict) -> dict | None:
    title = str(track.get("title") or "")
    base = base_title(title)
    if len(base) < 2 or is_variant(title):
        return None
    saved_subs = _saved_artist_subscribers(client, track)
    if saved_subs is None:
        return None  # nothing to compare the artist with: left alone
    try:
        found = client.search(base, filter="songs", limit=10) or []
    except Exception:  # noqa: BLE001
        return None
    duration = track.get("duration") or 0
    qualified: list[tuple[int, dict]] = []
    for item in found:
        video_id = item.get("videoId")
        if not video_id or video_id == track.get("sourceId"):
            continue
        if base_title(item.get("title") or "") != base or is_variant(item.get("title") or ""):
            continue
        names = _artist_names(item.get("artists"))
        if _same_artist(str(track.get("artist") or ""), names):
            continue
        other = item.get("duration_seconds") or 0
        # a remake is often shorter or longer than the original by a quarter and more, so the length only
        # rules out a different piece altogether (a twice as long or half as long one)
        if duration and other and not (0.5 <= other / duration <= 2.0):
            continue
        artists = item.get("artists") or []
        artist_id = artists[0].get("id") if artists and isinstance(artists[0], dict) else None
        subs = _subscribers(client, artist_id)
        if subs is None or subs < MIN_SUBSCRIBERS or subs < RATIO * max(saved_subs, 1):
            continue
        qualified.append((subs, item))
    if not qualified:
        return None
    qualified.sort(key=lambda pair: -pair[0])
    # two comparably big artists with a song of that name: which one was meant is not known, nothing is proposed
    if len(qualified) > 1 and qualified[0][0] < 10 * qualified[1][0]:
        return None
    best = qualified[0]
    from music_resolver.providers.youtube_music import map_search_item

    candidate = map_search_item(best[1])
    if candidate is None:
        return None
    return candidate_to_track(candidate).model_dump(by_alias=True)


def find_originals(client, tracks: list[dict]) -> dict[str, dict]:
    """{saved track id: the original track} for the tracks that have one."""
    wanted = [t for t in tracks[:MAX_TRACKS] if isinstance(t, dict) and t.get("id") and t.get("sourceId")]
    out: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for track, result in zip(wanted, pool.map(lambda t: _safe(client, t), wanted)):
            if result:
                out[str(track["id"])] = result
    return out


def _safe(client, track: dict) -> dict | None:
    try:
        return _one(client, track)
    except Exception:  # noqa: BLE001 - one track never spoils the rest
        return None
