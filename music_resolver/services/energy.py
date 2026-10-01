"""How energetic a track sounds — measured from the audio itself.

«Микс под настроение» starts from the listener's own music, and to pick
the tracks of theirs that fit a mood it has to tell a quiet song from a
driving one. Nothing in a track's metadata says that, so a short stretch
of the audio is decoded (ffmpeg) and four simple things are measured:

- how loud it is on average,
- how sharply the loudness jumps from moment to moment (drums, attacks),
- how "bright" the sound is (the rate of zero crossings),
- the tempo of those jumps.

The numbers mean little on their own; they are compared within one
listener's library (see ``rank``), which is all the mix needs: "the calmer
third of what you listen to", "the livelier third".

Results are kept in ``data/energy.json`` — a track is measured once.
"""

import json
import math
import subprocess
import threading
from array import array
from pathlib import Path

from music_resolver.services.plus_store import DATA_DIR
from music_resolver.utils.remux import ffmpeg_exe

_FILE = DATA_DIR / "energy.json"
_lock = threading.Lock()
_known: dict[str, dict] | None = None

_RATE = 8000  # Hz, mono: plenty for loudness, attacks and tempo
_HOP = 160  # 20 ms
_SECONDS = 40
_SKIP = 25  # the intro is often unlike the rest of the song


def _load() -> dict[str, dict]:
    global _known
    if _known is None:
        try:
            _known = json.loads(_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _known = {}
    return _known


def _save() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _FILE.with_name(_FILE.name + ".tmp")
    tmp.write_text(json.dumps(_known), encoding="utf-8")
    tmp.replace(_FILE)


def measure(path: Path) -> dict | None:
    """The four measurements for an audio file, or None if it can't be decoded."""
    exe = ffmpeg_exe()
    if not exe:
        return None
    try:
        done = subprocess.run(
            [exe, "-v", "error", "-ss", str(_SKIP), "-t", str(_SECONDS), "-i", str(path), "-vn", "-ac", "1", "-ar", str(_RATE), "-f", "s16le", "-"],
            capture_output=True,
            timeout=40,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    samples = array("h")
    samples.frombytes(done.stdout[: len(done.stdout) // 2 * 2])
    if len(samples) < _RATE * 8:  # a track shorter than the skipped intro: take it from the start
        if _SKIP:
            return _measure_from_start(path)
        return None
    return _features(samples)


def _measure_from_start(path: Path) -> dict | None:
    exe = ffmpeg_exe()
    try:
        done = subprocess.run(
            [exe, "-v", "error", "-t", str(_SECONDS), "-i", str(path), "-vn", "-ac", "1", "-ar", str(_RATE), "-f", "s16le", "-"],
            capture_output=True,
            timeout=40,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    samples = array("h")
    samples.frombytes(done.stdout[: len(done.stdout) // 2 * 2])
    return _features(samples) if len(samples) >= _RATE * 8 else None


def _features(samples: array) -> dict:
    # loudness of each 20 ms, in dB; and how often the wave crosses zero
    levels: list[float] = []
    crossings = 0
    previous = 0
    for start in range(0, len(samples) - _HOP, _HOP):
        total = 0
        for value in samples[start : start + _HOP]:
            total += value * value
            if (value >= 0) != (previous >= 0):
                crossings += 1
            previous = value
        levels.append(10 * math.log10(total / _HOP + 1))
    # attacks: how much louder each moment is than the one before
    attacks = [max(0.0, levels[i] - levels[i - 1]) for i in range(1, len(levels))]
    punch = sum(attacks) / len(attacks)
    # tempo: the lag at which the attacks repeat best, between 70 and 180 beats a minute
    frames_per_second = _RATE / _HOP
    mean_attack = punch
    centered = [a - mean_attack for a in attacks]
    best_lag, best_score = 0, 0.0
    for lag in range(int(frames_per_second * 60 / 180), int(frames_per_second * 60 / 70) + 1):
        score = sum(centered[i] * centered[i - lag] for i in range(lag, len(centered)))
        if score > best_score:
            best_lag, best_score = lag, score
    return {
        "loud": round(sum(levels) / len(levels), 2),
        "punch": round(punch, 3),
        "bright": round(crossings / len(samples), 4),
        "tempo": round(frames_per_second * 60 / best_lag) if best_lag else 0,
    }


def energy_of(key: str, path: Path | None) -> dict | None:
    """Measurements for a track, by its cache key: remembered, or taken now from its audio file."""
    with _lock:
        known = _load().get(key)
    if known is not None or path is None:
        return known
    measured = measure(path)
    if measured is None:
        return None
    with _lock:
        _load()[key] = measured
        _save()
    return measured


def rank(measured: dict[str, dict]) -> dict[str, float]:
    """Place each track between 0 (the calmest of these) and 1 (the liveliest).

    Each measurement is turned into "how many of the others are below it",
    so no single scale has to be right; attacks and loudness count the most."""
    keys = list(measured)
    if len(keys) < 2:
        return {key: 0.5 for key in keys}
    weights = {"punch": 0.35, "loud": 0.35, "bright": 0.2, "tempo": 0.1}
    score = {key: 0.0 for key in keys}
    for name, weight in weights.items():
        ordered = sorted(keys, key=lambda k: measured[k].get(name, 0))
        for position, key in enumerate(ordered):
            score[key] += weight * position / (len(keys) - 1)
    return score
