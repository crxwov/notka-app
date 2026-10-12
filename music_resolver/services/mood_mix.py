"""«Микс под настроение», built from the listener's own music.

The first version took ready-made "mood" playlists and looked for the
listener's artists in them — and, finding none, played strangers. This
one goes the other way round:

1. the listener's own tracks ("seeds") are placed on a scale from calm to
   lively by how they sound (see ``energy``);
2. the mood says which end of that scale is wanted — a calm third for
   «Спокойное» or «Для сна», a lively one for «Бодрое» or «Спорт»;
3. from a few of those tracks, YouTube Music's radio gives what it would
   play next: music near this listener's taste, in the manner of the seed;
4. a little is added from the mood's own playlists — only tracks by
   artists that the radio has already shown to be near.

Genres («Русский рок»…) are a different request — "this kind of music",
not "my music in this mood" — and keep the playlist way, with the
listener's artists first.
"""

import random
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from music_resolver.models import TrackCandidate
from music_resolver.services import energy, track_profile

# which end of the listener's own calm-to-lively scale a mood wants, and
# how wide a part of it: (from, to) as shares of that scale
MOOD_RANGE = {
    "energize": (0.6, 1.0),
    "workout": (0.65, 1.0),
    "party": (0.55, 1.0),
    "chill": (0.0, 0.4),
    "sleep": (0.0, 0.3),
    "focus": (0.0, 0.45),
    "sad": (0.0, 0.45),
    "romance": (0.1, 0.6),
}
_MEASURE_PER_REQUEST = 16  # tracks measured anew in one go; the rest next time
_SEEDS = 3


def _artist_parts(artist: str) -> list[str]:
    return [part.strip().lower() for part in re.split(r",|&| feat\.? ", artist or "") if part.strip()]


def _by_mood(key: str, tracks: list[TrackCandidate], seed_artists: set[str] | None = None) -> list[TrackCandidate]:
    """Puts the tracks that suit the mood first and drops the ones that clearly do not.

    A track is judged by its own sound when it has been measured, by the artist's
    other tracks when not, and by the artist's genres as a last resort. What is not
    known at all keeps a middle place (it may be exactly right), and the unknown
    artists are queued to be looked up, so the next mix knows more."""
    if key not in track_profile.MOODS or len(tracks) < 4:
        return tracks
    scored = []
    for t in tracks:
        fit, how = track_profile.fit_for(f"{t.source}_{t.source_id}", t.artist, key)
        if how == "none":
            track_profile.want_artist(t.artist)
        if fit is not None and how in ("track", "artist") and fit < 0.25:
            continue  # measured, and it is not that kind of music
        score = fit if fit is not None else 0.45
        if how == "tags":
            score = min(score, 0.6)  # a genre alone is a weak reason
        scored.append((score + random.random() * 0.12, t))
    if len(scored) < 6:  # too strict for what there is: keep the order as it was
        return tracks
    scored.sort(key=lambda x: -x[0])
    return [t for _, t in scored]


def build(
    provider,
    key: str,
    limit: int,
    seeds: list[dict],
    artists: list[str],
    ru_share: float | None,
    audio_path: Callable[[str, str], Path | None],
    video_id: Callable[[str, str], str | None],
) -> tuple[list[TrackCandidate], list[str]]:
    """The mix and the ids of the listener's tracks it was grown from."""
    wanted = MOOD_RANGE.get(key)
    usable = []
    for seed in seeds:
        vid = video_id(str(seed.get("source") or ""), str(seed.get("id") or ""))
        if vid:
            usable.append({"key": f"{seed['source']}_{seed['id']}", "source": seed["source"], "id": seed["id"], "video": vid, "artist": str(seed.get("artist") or "")})
    if wanted is None or len(usable) < 2:
        return _by_mood(key, provider._mood_tracks_sync(key, limit * 2, artists, ru_share))[:limit], []

    # 1. where each of the listener's tracks stands between calm and lively
    measured: dict[str, dict] = {}
    to_measure = []
    for seed in usable:
        known = energy.energy_of(seed["key"], None)
        if known is not None:
            measured[seed["key"]] = known
        else:
            path = audio_path(seed["source"], seed["id"])
            if path is not None and len(to_measure) < _MEASURE_PER_REQUEST:
                to_measure.append((seed["key"], path))
    if to_measure:
        with ThreadPoolExecutor(max_workers=4) as pool:
            for (seed_key, _), result in zip(to_measure, pool.map(lambda item: energy.energy_of(*item), to_measure)):
                if result is not None:
                    measured[seed_key] = result

    # 2. the tracks from the end of the scale the mood asks for
    if len(measured) >= 4:
        place = energy.rank(measured)
        low, high = wanted
        fitting = [s for s in usable if s["key"] in place and low <= place[s["key"]] <= high]
        if len(fitting) < 2:  # a narrow band in a small library: the nearest ones instead
            middle = (low + high) / 2
            fitting = sorted((s for s in usable if s["key"] in place), key=lambda s: abs(place[s["key"]] - middle))[:_SEEDS]
    else:
        # too little of this listener's music has been heard through Нотка
        # to be measured yet: their taste still comes first, the mood second
        fitting = usable[:12]
    # a seed whose own sound is known to suit the mood goes first
    def seed_fit(seed: dict) -> float:
        fit, how = track_profile.fit_for(seed["key"], seed.get("artist", ""), key)
        return fit if fit is not None and how in ("track", "artist") else 0.0
    measured_seeds = sorted((s for s in usable if seed_fit(s) >= 0.55), key=lambda s: -seed_fit(s))
    if len(measured_seeds) >= 2:
        fitting = measured_seeds[:12]
    picked = random.sample(fitting, min(_SEEDS, len(fitting)))

    # 3. what would play next after each of them
    def radio_of(seed: dict) -> list[TrackCandidate]:
        try:
            return provider._radio_sync(seed["video"], 25)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=_SEEDS) as pool:
        radios = list(pool.map(radio_of, picked))

    seen: set[str] = set()

    def fresh(track: TrackCandidate) -> bool:
        same_song = f"{track.title.lower()}|{track.artist.lower()}"
        if track.id in seen or same_song in seen:
            return False
        seen.update((track.id, same_song))
        return True

    # taken in turn from each radio, so no single seed takes the mix over
    near: list[TrackCandidate] = []
    for row in zip(*[radio + [None] * (25 - len(radio)) for radio in radios]) if radios else []:
        near.extend(track for track in row if track is not None and fresh(track))
    if len(near) < 8:
        return _by_mood(key, provider._mood_tracks_sync(key, limit * 2, artists, ru_share))[:limit], [s["id"] for s in picked]

    # 4. from the mood's own playlists — only what is by artists already near
    neighbours = {part for track in near for part in _artist_parts(track.artist)}
    neighbours.update(name.strip().lower() for name in artists if name and name.strip())
    try:
        mood_pool = provider._mood_pool_sync(key, ru_share)
    except Exception:
        mood_pool = []
    from_mood = [t for t in mood_pool if any(part in neighbours for part in _artist_parts(t.artist)) and fresh(t)][:10]

    near = _by_mood(key, near)
    from_mood = _by_mood(key, from_mood)
    mix = near[:limit]
    for index, track in enumerate(from_mood):  # spread through the mix, not bunched at an end
        mix.insert(min(len(mix), 3 + index * 4), track)
    return mix[:limit], [s["id"] for s in picked]
