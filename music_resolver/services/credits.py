"""Who made a track: performers, writers, producers, label, release date.

YouTube Music does not give this, so it is put together from open sources, each one only when it
surely is the same recording:

1. Deezer (open, no key): the ISRC of the recording, all credited performers, the label and the
   release date. The result is accepted only when the title and the artist agree and the length is
   within a few seconds.
2. MusicBrainz (open, one request a second): writers, producers, mixing and recording people, by the
   ISRC. Many tracks have none there: nothing is invented then.
3. Genius (needs ``GENIUS_ACCESS_TOKEN`` in .env, a free key): writers, producers, featured artists.
   The widest coverage, for Russian rap too. Skipped without a key.
"""

import asyncio
import hashlib
import json
import os
import re
import time
from pathlib import Path

import httpx

_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "cache" / "credits"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_UA = "Notka/1.0 (asyaandreeva209@gmail.com)"
_HIT_TTL = 30 * 86400
_MISS_TTL = 6 * 3600
_EMPTY = {"found": False}

_ROLE_GROUPS = {
    "writer": "writers", "composer": "writers", "lyricist": "writers", "librettist": "writers", "arranger": "writers",
    "producer": "producers", "co-producer": "producers", "executive producer": "producers",
    "mix": "engineers", "mastering": "engineers", "recording": "engineers", "engineer": "engineers",
    "sound": "engineers", "balance": "engineers", "programming": "engineers",
    "vocal": "performers", "performer": "performers", "instrument": "performers",
}


def _norm(text: str) -> str:
    text = re.sub(r"\s*[\(\[].*?[\)\]]", "", text or "").lower().replace("ё", "е")
    text = re.sub(r"\b(feat|ft)\b\.?.*$", "", text)
    return re.sub(r"[^\w]+", "", text)


def _path(title: str, artist: str, duration: int) -> Path:
    key = f"c1|{_norm(title)}|{_norm(artist)}|{round((duration or 0) / 3)}"
    return _CACHE_DIR / (hashlib.sha1(key.encode("utf-8")).hexdigest() + ".json")


def _add(groups: dict, key: str, names) -> None:
    bucket = groups.setdefault(key, [])
    for name in names:
        name = (name or "").strip()
        if name and name.lower() not in {n.lower() for n in bucket}:
            bucket.append(name)


async def _deezer(client: httpx.AsyncClient, title: str, artist: str, duration: int) -> dict | None:
    res = await client.get("https://api.deezer.com/search", params={"q": f'artist:"{artist}" track:"{title}"', "limit": 5})
    items = res.json().get("data", []) if res.status_code == 200 else []
    if not items:
        res = await client.get("https://api.deezer.com/search", params={"q": f"{artist} {title}", "limit": 5})
        items = res.json().get("data", []) if res.status_code == 200 else []
    want_t, want_a = _norm(title), _norm(artist)
    for item in items:
        got_t = _norm(item.get("title") or "")
        got_a = _norm((item.get("artist") or {}).get("name") or "")
        if not got_t or not (got_t == want_t or got_t in want_t or want_t in got_t):
            continue
        if want_a and got_a and not (want_a in got_a or got_a in want_a):
            continue
        if duration and item.get("duration") and abs(int(item["duration"]) - duration) > 6:
            continue
        track = (await client.get(f"https://api.deezer.com/track/{item['id']}")).json()
        info = {
            "isrc": track.get("isrc"),
            "performers": [c.get("name") for c in track.get("contributors", []) if c.get("name")],
            "released": track.get("release_date"),
            "album": (track.get("album") or {}).get("title"),
        }
        album_id = (track.get("album") or {}).get("id")
        if album_id:
            alb = (await client.get(f"https://api.deezer.com/album/{album_id}")).json()
            info["label"] = alb.get("label")
        return info
    return None


async def _musicbrainz(client: httpx.AsyncClient, isrc: str) -> dict:
    out: dict = {}
    res = await client.get("https://musicbrainz.org/ws/2/recording", params={"query": f"isrc:{isrc}", "fmt": "json", "limit": 1})
    recs = res.json().get("recordings", []) if res.status_code == 200 else []
    if not recs:
        return out
    await asyncio.sleep(1.1)
    res = await client.get(f"https://musicbrainz.org/ws/2/recording/{recs[0]['id']}", params={"inc": "artist-rels+work-rels", "fmt": "json"})
    if res.status_code != 200:
        return out
    work_ids: list[str] = []
    for rel in res.json().get("relations", []):
        group = _ROLE_GROUPS.get(rel.get("type", ""))
        artist = rel.get("artist")
        if artist and group:
            _add(out, group, [artist.get("name")])
        work = rel.get("work")
        if work and len(work_ids) < 2:
            work_ids.append(work["id"])
    for wid in work_ids:
        await asyncio.sleep(1.1)
        res = await client.get(f"https://musicbrainz.org/ws/2/work/{wid}", params={"inc": "artist-rels", "fmt": "json"})
        if res.status_code != 200:
            continue
        for rel in res.json().get("relations", []):
            group = _ROLE_GROUPS.get(rel.get("type", ""))
            if rel.get("artist") and group:
                _add(out, group, [rel["artist"].get("name")])
    return out


async def _genius(client: httpx.AsyncClient, token: str, title: str, artist: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    res = await client.get("https://api.genius.com/search", params={"q": f"{artist} {title}"}, headers=headers)
    if res.status_code != 200:
        return {}
    want_t, want_a = _norm(title), _norm(artist)
    for hit in res.json().get("response", {}).get("hits", [])[:5]:
        song = hit.get("result", {})
        got_t = _norm(song.get("title") or "")
        got_a = _norm((song.get("primary_artist") or {}).get("name") or "")
        if not got_t or not (got_t == want_t or got_t in want_t or want_t in got_t):
            continue
        if want_a and got_a and not (want_a in got_a or got_a in want_a):
            continue
        full = await client.get(f"https://api.genius.com/songs/{song['id']}", params={"text_format": "plain"}, headers=headers)
        if full.status_code != 200:
            return {}
        s = full.json().get("response", {}).get("song", {})
        out: dict = {}
        _add(out, "writers", [a.get("name") for a in s.get("writer_artists", [])])
        _add(out, "producers", [a.get("name") for a in s.get("producer_artists", [])])
        _add(out, "performers", [a.get("name") for a in s.get("featured_artists", [])])
        for perf in s.get("custom_performances", []):
            group = _ROLE_GROUPS.get(str(perf.get("label", "")).lower().split()[0] if perf.get("label") else "")
            _add(out, group or "other", [a.get("name") for a in perf.get("artists", [])])
        if s.get("release_date"):
            out["released"] = s["release_date"]
        return out
    return {}


async def find_credits(title: str, artist: str, duration: int | None) -> dict:
    title, artist, duration = (title or "").strip(), (artist or "").strip(), int(duration or 0)
    if not title:
        return _EMPTY
    path = _path(title, artist, duration)
    try:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            ttl = _HIT_TTL if data.get("found") else _MISS_TTL
            if time.time() - path.stat().st_mtime < ttl:
                return data
    except (OSError, ValueError):
        pass

    groups: dict = {}
    sources: list[str] = []
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": _UA}) as client:
        try:
            deezer = await _deezer(client, title, artist, duration)
        except Exception:  # noqa: BLE001
            deezer = None
        isrc = None
        if deezer:
            sources.append("Deezer")
            isrc = deezer.get("isrc")
            _add(groups, "performers", deezer.get("performers", []))
            for key in ("label", "released", "album", "isrc"):
                if deezer.get(key):
                    groups[key] = deezer[key]
        token = os.environ.get("GENIUS_ACCESS_TOKEN", "").strip()
        if token:
            try:
                genius = await _genius(client, token, title, artist)
            except Exception:  # noqa: BLE001
                genius = {}
            if genius:
                sources.append("Genius")
                for key, value in genius.items():
                    if isinstance(value, list):
                        _add(groups, key, value)
                    elif key not in groups:
                        groups[key] = value
        if isrc:
            try:
                mb = await asyncio.wait_for(_musicbrainz(client, isrc), timeout=12)
            except Exception:  # noqa: BLE001
                mb = {}
            if mb:
                sources.append("MusicBrainz")
                for key, value in mb.items():
                    _add(groups, key, value)

    has_people = any(groups.get(k) for k in ("writers", "producers", "engineers", "other"))
    # the performers alone (one artist) are not worth a block: they are the artist the listener sees
    result = {"found": bool(has_people or len(groups.get("performers", [])) > 1 or groups.get("label")), "sources": sources, **groups}
    try:
        path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    return result
