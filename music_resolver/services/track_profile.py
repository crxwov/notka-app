"""What a track is like: its mood, character and genre.

YouTube Music says nothing about this for a single song, and the previous
«Под настроение» had to guess from how loud a track is. Here every track
that anybody plays through Нотка gets a profile, kept for good and shared
by everyone:

* **sound** — energy, valence («how positive»), danceability, acousticness,
  instrumentalness, speechiness, tempo: taken from two 30-second stretches of
  the audio that is already on the server (the same kind of measurements that
  Spotify and Yandex built their moods on). Done in the background after a
  track has been played, never in the listener's way;
* **genre and character** — the artist's genres and tags from MusicBrainz
  (an open music database), kept per artist;
* **mood** — ``mood_fit`` turns those numbers into «how well does this track
  suit Бодрое / Спокойное / Грустное…». Where the sound of a track is not
  known yet, other tracks of the artist and the artist's tags stand in for it.

Everything is cached in ``data/track_profiles.json`` and ``data/artist_tags.json``.
"""

from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from music_resolver.services.plus_store import DATA_DIR
from music_resolver.utils.remux import ffmpeg_exe

_TRACKS = DATA_DIR / "track_profiles.json"
_ARTISTS = DATA_DIR / "artist_tags.json"
_lock = threading.Lock()
_tracks: dict[str, dict] | None = None
_artists: dict[str, dict] | None = None

_FEATURES_URL = os.environ.get("AUDIO_FEATURES_URL", "https://api.reccobeats.com/v1/analysis/audio-features")
_MB = "https://musicbrainz.org/ws/2"
_UA = "Notka/1.0 (https://t.me/notka_app_bot)"
_FEATURE_KEYS = ("energy", "valence", "danceability", "acousticness", "instrumentalness", "speechiness", "tempo")

MOODS = ("energize", "workout", "party", "chill", "sleep", "focus", "sad", "romance")


# ------------------------------------------------------------------ storage
def _read(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path: Path, data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def _tracks_db() -> dict[str, dict]:
    global _tracks
    if _tracks is None:
        _tracks = _read(_TRACKS)
    return _tracks


def _artists_db() -> dict[str, dict]:
    global _artists
    if _artists is None:
        _artists = _read(_ARTISTS)
    return _artists


def artist_key(name: str) -> str:
    first = re.split(r",|&| feat\.? | ft\.? | x ", str(name or ""), flags=re.I)[0]
    return re.sub(r"[^\w]+", " ", first.lower()).strip()


def known(key: str) -> dict | None:
    with _lock:
        return _tracks_db().get(key)


def known_count() -> int:
    with _lock:
        return len(_tracks_db())


# ------------------------------------------------------------ mood scoring
def _trap(x: float, a: float, b: float, c: float, d: float) -> float:
    """1 between b and c, falling to 0 at a and d (a soft «is x about right»)."""
    if x is None:
        return 0.5
    if x <= a or x >= d:
        return 0.0
    if b <= x <= c:
        return 1.0
    return (x - a) / (b - a) if x < b else (d - x) / (d - c)


def mood_fit(f: dict, mood: str) -> float | None:
    """0..1: how well sound features ``f`` suit ``mood``; None if there are none.

    Each mood has one thing that must be right (the «gate»: a sad song has to be
    low in valence, a party song danceable…); the other traits then raise or
    lower the result but cannot rescue a track that fails the gate."""
    if not f or f.get("energy") is None:
        return None
    e, v = f.get("energy", 0.5), f.get("valence", 0.5)
    d, a = f.get("danceability", 0.5), f.get("acousticness", 0.3)
    i, s, t = f.get("instrumentalness", 0.0), f.get("speechiness", 0.1), f.get("tempo", 110) or 110
    if mood == "energize":
        gate, rest = _trap(e, 0.35, 0.62, 1.0, 1.1), [(1.5, _trap(v, 0.2, 0.45, 1.0, 1.1)), (1, _trap(t, 80, 105, 190, 230)), (1, _trap(d, 0.3, 0.55, 1.0, 1.1))]
    elif mood == "workout":
        gate, rest = _trap(e, 0.45, 0.7, 1.0, 1.1), [(2, _trap(t, 95, 118, 185, 230)), (1.5, _trap(d, 0.4, 0.6, 1.0, 1.1)), (1, _trap(a, -0.1, -0.05, 0.3, 0.7))]
    elif mood == "party":
        gate, rest = _trap(d, 0.45, 0.65, 1.0, 1.1), [(2, _trap(v, 0.3, 0.55, 1.0, 1.1)), (2, _trap(e, 0.45, 0.65, 1.0, 1.1)), (1, _trap(a, -0.1, -0.05, 0.35, 0.8))]
    elif mood == "chill":
        gate, rest = _trap(e, -0.1, 0.0, 0.45, 0.65), [(1.5, _trap(a, 0.1, 0.35, 1.0, 1.1)), (1.5, _trap(t, 40, 60, 112, 135)), (1, _trap(v, 0.15, 0.3, 0.75, 0.95))]
    elif mood == "sleep":
        gate, rest = _trap(e, -0.1, 0.0, 0.22, 0.42), [(2, _trap(a, 0.3, 0.55, 1.0, 1.1)), (1.5, _trap(t, 30, 50, 100, 125)), (1.5, _trap(s, -0.1, 0.0, 0.08, 0.2))]
    elif mood == "focus":
        # even music, words allowed (even rap): what matters is that nothing jolts: not too quiet to drift off,
        # not loud and sharp, a steady tempo. Wordless music is a plus, not a requirement.
        gate = _trap(e, 0.08, 0.22, 0.66, 0.85)
        rest = [
            (1.5, _trap(s, -0.1, 0.0, 0.3, 0.6)),   # speech is fine up to a rap's amount
            (1, 0.55 + 0.45 * _trap(i, -0.1, 0.0, 1.0, 1.1)),  # no words at all: a little better
            (1.5, _trap(t, 55, 75, 128, 165)),
            (1, _trap(d, 0.1, 0.35, 0.8, 0.98)),
            (0.5, _trap(v, 0.1, 0.25, 0.8, 0.95)),
        ]
    elif mood == "sad":
        gate, rest = _trap(v, -0.1, 0.0, 0.28, 0.45), [(2, _trap(e, -0.1, 0.0, 0.4, 0.62)), (1.5, _trap(d, -0.1, 0.0, 0.65, 0.85)), (1, _trap(t, 30, 55, 115, 140))]
    elif mood == "romance":
        gate, rest = _trap(e, 0.05, 0.15, 0.5, 0.68), [(2.5, _trap(v, 0.2, 0.35, 0.7, 0.9)), (1.5, _trap(a, 0.1, 0.3, 1.0, 1.1)), (1, _trap(t, 50, 70, 115, 135))]
    else:
        return None
    total = sum(w for w, _ in rest)
    mix = sum(w * m for w, m in rest) / total
    return round(gate * (0.25 + 0.75 * mix), 3)


# a weak guess from the artist's genres, when there is no sound measurement yet
_TAG_MOODS = (
    (re.compile(r"ambient|drone|new age|sleep|meditation|nature", re.I), {"sleep": 0.8, "chill": 0.7, "focus": 0.6}),
    (re.compile(r"classical|piano|minimalis|neoclassical|soundtrack|score|instrumental", re.I), {"focus": 0.75, "sleep": 0.5, "romance": 0.5, "chill": 0.5, "sad": 0.4}),
    (re.compile(r"lo-?fi|chillout|chillhop|downtempo|trip.?hop|bossa|jazz|acoustic|folk|singer", re.I), {"chill": 0.75, "focus": 0.55, "romance": 0.5}),
    (re.compile(r"metal|hardcore|punk|thrash|hard rock|drum and bass|dubstep|hardstyle|trap", re.I), {"energize": 0.8, "workout": 0.8}),
    (re.compile(r"dance|house|techno|edm|disco|eurodance|club|electro|funk|reggaeton|latin", re.I), {"party": 0.8, "energize": 0.7, "workout": 0.6}),
    (re.compile(r"hip.?hop|rap", re.I), {"energize": 0.55, "workout": 0.55, "party": 0.5}),
    (re.compile(r"r&b|soul|ballad|love song|slow", re.I), {"romance": 0.7, "chill": 0.5, "sad": 0.4}),
    (re.compile(r"emo|sadcore|darkwave|shoegaze|gothic|depress", re.I), {"sad": 0.75, "chill": 0.4}),
    (re.compile(r"pop|indie pop|synth", re.I), {"energize": 0.45, "party": 0.45, "romance": 0.4}),
    (re.compile(r"rock|alternative|grunge|indie", re.I), {"energize": 0.55, "workout": 0.45, "sad": 0.3}),
)


def tag_prior(tags: list[str], mood: str) -> float | None:
    best = None
    for pattern, moods in _TAG_MOODS:
        if any(pattern.search(t) for t in tags) and mood in moods:
            best = max(best or 0.0, moods[mood])
    return best


def fit_for(track_key: str, artist: str, mood: str) -> tuple[float | None, str]:
    """How well a track suits a mood, and what it rests on:
    «track» (its own sound), «artist» (the artist's other tracks), «tags» (genres) or «none»."""
    with _lock:
        own = _tracks_db().get(track_key)
        if own:
            fit = mood_fit(own, mood)
            if fit is not None:
                return fit, "track"
        ak = artist_key(artist)
        sibs = [p for p in _tracks_db().values() if p.get("ak") == ak and p.get("energy") is not None]
        tags = (_artists_db().get(ak) or {}).get("tags") or []
    if sibs:
        avg = {k: sum(p.get(k, 0) or 0 for p in sibs) / len(sibs) for k in _FEATURE_KEYS}
        fit = mood_fit(avg, mood)
        if fit is not None:
            return round(fit * 0.9, 3), "artist"
    prior = tag_prior(tags, mood)
    if prior is not None:
        return round(prior * 0.7, 3), "tags"
    if tags:  # the genres are known and none of them points to this mood
        return 0.2, "tags"
    return None, "none"


# ----------------------------------------------------- sound measurements
def _snippets(path: Path, duration: float | None) -> list[bytes]:
    """Two 30-second stretches (a third and two thirds in) as ordinary MP3."""
    exe = ffmpeg_exe()
    if not exe:
        return []
    dur = duration if duration and duration > 60 else 200.0
    offsets = [max(5.0, dur * 0.3), max(35.0, dur * 0.62)]
    out: list[bytes] = []
    for off in offsets:
        if off + 25 > dur:
            off = max(0.0, dur - 31)
        try:
            done = subprocess.run(
                [exe, "-v", "error", "-ss", f"{off:.1f}", "-t", "30", "-i", str(path), "-vn", "-ac", "2", "-ar", "44100", "-b:a", "128k", "-f", "mp3", "-"],
                capture_output=True, timeout=60, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if len(done.stdout) > 50_000 and not any(o == done.stdout for o in out):
            out.append(done.stdout)
    return out


def _upload(data: bytes) -> dict | None:
    boundary = uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="audioFile"; filename="s.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(_FEATURES_URL, data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            parsed = json.loads(res.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError):
        return None
    if not isinstance(parsed, dict) or "energy" not in parsed:
        return None
    return {k: float(parsed[k]) for k in _FEATURE_KEYS if isinstance(parsed.get(k), (int, float))}


def measure_sound(path: Path, duration: float | None = None) -> dict | None:
    results = [r for r in (_upload(s) for s in _snippets(path, duration)) if r]
    if not results:
        return None
    avg = {k: round(sum(r.get(k, 0.0) for r in results) / len(results), 3) for k in _FEATURE_KEYS}
    avg["n"] = len(results)
    return avg


# ------------------------------------------------- artist genres and tags
_last_mb = [0.0]


def _mb_get(path: str) -> dict | None:
    wait = 1.1 - (time.time() - _last_mb[0])
    if wait > 0:
        time.sleep(wait)
    _last_mb[0] = time.time()
    req = urllib.request.Request(f"{_MB}{path}", headers={"User-Agent": _UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            return json.loads(res.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError):
        return None


def fetch_artist_tags(name: str) -> dict | None:
    found = _mb_get("/artist?" + urllib.parse.urlencode({"query": f'artist:"{name}"', "fmt": "json", "limit": 1}))
    arts = (found or {}).get("artists") or []
    if not arts:
        return None
    full = _mb_get(f"/artist/{arts[0]['id']}?inc=tags+genres&fmt=json")
    if not full:
        return None
    genres = [g["name"] for g in (full.get("genres") or [])][:6]
    tags = [t["name"] for t in sorted(full.get("tags") or [], key=lambda x: -x.get("count", 0))][:10]
    return {"genres": genres, "tags": list(dict.fromkeys(genres + tags))[:12], "at": int(time.time())}


# --------------------------------------------------------- background work
_jobs: "queue.Queue[tuple]" = queue.Queue(maxsize=200)
_queued: set[str] = set()
_worker_started = False


def _worker() -> None:
    while True:
        kind, key, payload = _jobs.get()
        try:
            if kind == "sound":
                path, duration, title, artist = payload
                result = measure_sound(Path(path), duration)
                with _lock:
                    db = _tracks_db()
                    if result:
                        result.update({"ak": artist_key(artist), "title": str(title)[:80], "at": int(time.time())})
                        db[key] = result
                    else:
                        db[key] = {"failed": int(time.time()), "ak": artist_key(artist)}  # not retried for a day
                    _write(_TRACKS, db)
            elif kind == "artist":
                tags = fetch_artist_tags(payload)
                with _lock:
                    db = _artists_db()
                    db[key] = tags or {"tags": [], "at": int(time.time())}
                    _write(_ARTISTS, db)
        except Exception:  # a job never takes the worker down
            pass
        finally:
            with _lock:
                _queued.discard(f"{kind}:{key}")
            time.sleep(0.3)


def _ensure_worker() -> None:
    global _worker_started
    if not _worker_started:
        _worker_started = True
        threading.Thread(target=_worker, name="track-profile", daemon=True).start()


def want_sound(track_key: str, path: Path, duration: float | None, title: str, artist: str) -> None:
    """After a track has been played: measure it once, in the background."""
    if os.environ.get("NOTKA_NO_PROFILING"):
        return
    with _lock:
        have = _tracks_db().get(track_key)
        if have and (have.get("energy") is not None or time.time() - have.get("failed", 0) < 86400):
            pass
        elif f"sound:{track_key}" not in _queued:
            _queued.add(f"sound:{track_key}")
            try:
                _ensure_worker()
                _jobs.put_nowait(("sound", track_key, (str(path), duration, title, artist)))
            except queue.Full:
                _queued.discard(f"sound:{track_key}")
    want_artist(artist)


def want_artist(artist: str) -> None:
    key = artist_key(artist)
    if not key or os.environ.get("NOTKA_NO_PROFILING"):
        return
    with _lock:
        have = _artists_db().get(key)
        if have and time.time() - have.get("at", 0) < 90 * 86400:
            return
        if f"artist:{key}" in _queued:
            return
        _queued.add(f"artist:{key}")
    try:
        _ensure_worker()
        _jobs.put_nowait(("artist", key, str(artist).split(",")[0].strip()))
    except queue.Full:
        with _lock:
            _queued.discard(f"artist:{key}")
