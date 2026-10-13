"""The numbers behind the admin site, put together from what the server holds:
the register of people (metrics.users), each person's synced account state
(sync_store files), who has Плюс (plus.json) and who took part in events,
and the daily counters (metrics.counters)."""

from __future__ import annotations

import collections
import json
import os
import shutil
import sys
import time
from pathlib import Path

from music_resolver.services import metrics, sync_store

DATA_DIR = sync_store.DATA_DIR
DAY = 86400


def _json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _system_stats() -> dict:
    total_mb, used_mb, pct = 0, 0, 0.0
    try:
        mem = {}
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    mem[parts[0].strip()] = int(parts[1].strip().split()[0])
        total_mb = round(mem.get("MemTotal", 0) / 1024)
        avail_mb = round(mem.get("MemAvailable", 0) / 1024)
        used_mb = total_mb - avail_mb
        pct = round((used_mb / max(1, total_mb)) * 100, 1)
    except Exception:
        pass

    disk_total_gb, disk_used_gb, disk_pct = 0.0, 0.0, 0.0
    try:
        du = shutil.disk_usage("/")
        disk_total_gb = round(du.total / (1024**3), 1)
        disk_used_gb = round(du.used / (1024**3), 1)
        disk_pct = round((du.used / max(1, du.total)) * 100, 1)
    except Exception:
        pass

    loads = [0.0, 0.0, 0.0]
    uptime_sec = 0
    try:
        with open("/proc/loadavg") as f:
            loads = [round(float(x), 2) for x in f.read().split()[:3]]
        with open("/proc/uptime") as f:
            uptime_sec = int(float(f.read().split()[0]))
    except Exception:
        pass

    tun_active = os.path.exists("/sys/class/net/tun0")

    return {
        "ram_total_mb": total_mb,
        "ram_used_mb": used_mb,
        "ram_pct": pct,
        "disk_total_gb": disk_total_gb,
        "disk_used_gb": disk_used_gb,
        "disk_pct": disk_pct,
        "load_avg": loads,
        "uptime_sec": uptime_sec,
        "tun_active": tun_active,
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    }


def _audio_dna() -> dict:
    profiles = _json(DATA_DIR / "track_profiles.json")
    if not profiles:
        return {}
    energies = [p["energy"] for p in profiles.values() if isinstance(p, dict) and "energy" in p]
    valences = [p["valence"] for p in profiles.values() if isinstance(p, dict) and "valence" in p]
    dance = [p["danceability"] for p in profiles.values() if isinstance(p, dict) and "danceability" in p]
    tempos = [p["tempo"] for p in profiles.values() if isinstance(p, dict) and "tempo" in p]
    count = len(energies)
    if not count:
        return {}
    return {
        "analyzed_tracks": len(profiles),
        "energy": round(sum(energies) / count, 2),
        "valence": round(sum(valences) / count, 2),
        "danceability": round(sum(dance) / count, 2),
        "tempo": round(sum(tempos) / count, 1),
    }


def _top_genres() -> list[dict]:
    tags_data = _json(DATA_DIR / "artist_tags.json")
    if not tags_data:
        return []
    genre_counter = collections.Counter()
    for meta in tags_data.values():
        if isinstance(meta, dict):
            for g in meta.get("genres", []):
                clean = str(g).lower().strip()
                if clean:
                    genre_counter[clean] += 1
    total = sum(genre_counter.values()) or 1
    return [
        {"genre": g, "count": cnt, "pct": round((cnt / total) * 100, 1)}
        for g, cnt in genre_counter.most_common(12)
    ]


def _merge_listens(parts: list[dict]) -> dict:
    out = {"seconds": 0.0, "plays": 0, "tracks": {}, "artists": {}, "days": {}}
    for src in parts:
        if not isinstance(src, dict):
            continue
        out["seconds"] += float(src.get("seconds") or 0)
        out["plays"] += int(src.get("plays") or 0)
        for tid, x in (src.get("tracks") or {}).items():
            t = out["tracks"].setdefault(tid, {"track": x.get("track"), "plays": 0, "seconds": 0.0})
            t["plays"] += int(x.get("plays") or 0)
            t["seconds"] += float(x.get("seconds") or 0)
        for name, x in (src.get("artists") or {}).items():
            a = out["artists"].setdefault(name, {"plays": 0, "seconds": 0.0})
            a["plays"] += int(x.get("plays") or 0)
            a["seconds"] += float(x.get("seconds") or 0)
        for key, d in (src.get("days") or {}).items():
            day = out["days"].setdefault(key, {"s": 0.0, "p": 0})
            day["s"] += float(d.get("s") or 0)
            day["p"] += int(d.get("p") or 0)
    return out


def _date_ts(key: str) -> float:
    try:
        return time.mktime(time.strptime(key, "%Y-%m-%d"))
    except ValueError:
        return 0.0


def _cache_disk_stats() -> dict:
    audio_dir = DATA_DIR.parent / "cache" / "audio_v2"
    count = 0
    total_bytes = 0
    if audio_dir.exists():
        for f in audio_dir.iterdir():
            if f.suffix == ".bin":
                try:
                    total_bytes += f.stat().st_size
                    count += 1
                except OSError:
                    pass
    return {
        "files_count": count,
        "size_mb": round(total_bytes / (1024 * 1024), 1),
    }


def summary(preloader_status: dict | None = None) -> dict:
    now = time.time()
    today = metrics.day_key(now)
    registry = metrics.users()
    plus = _json(DATA_DIR / "plus.json")
    plus_users = plus.get("users") or {}
    events = _json(DATA_DIR / "events.json")
    event_users = events.get("users") or {}

    sync_dir = DATA_DIR / "sync"
    sync: dict[str, dict] = {}
    if sync_dir.exists():
        for path in sync_dir.glob("*.json"):
            data = _json(path)
            if data:
                data["_mtime"] = path.stat().st_mtime
                sync[path.stem] = data

    ids = set(registry) | set(sync) | set(plus_users) | set(event_users)
    for code in (plus.get("codes") or {}).values():
        ids |= set((code.get("used") or {}).keys())

    rows = []
    all_listens = []
    for uid in ids:
        reg = registry.get(uid) or {}
        sy = sync.get(uid) or {}
        shared = sy.get("shared") or {}
        devices = sy.get("devices") or {}
        listens = _merge_listens([d.get("listens") for d in devices.values()])
        all_listens.append(listens)
        until = int((plus_users.get(uid) or {}).get("until") or 0)
        history = (plus_users.get(uid) or {}).get("history") or []

        active_days = set(reg.get("days") or [])
        for key, d in listens["days"].items():
            if (d.get("s") or 0) > 0 or (d.get("p") or 0) > 0:
                active_days.add(key)
        last_seen = int(reg.get("last_seen") or 0)
        if not last_seen and active_days:
            last_seen = int(_date_ts(max(active_days)) + 12 * 3600)
        if not last_seen and sy:
            last_seen = int(sy.get("_mtime") or 0)
        first_seen = int(reg.get("first_seen") or 0)
        if not first_seen and active_days:
            first_seen = int(_date_ts(min(active_days)))
        top_artists = sorted(listens["artists"].items(), key=lambda kv: -kv[1]["seconds"])[:3]
        rows.append({
            "id": uid,
            "name": reg.get("name") or shared.get("accountName") or "",
            "username": reg.get("username") or "",
            "lang": reg.get("lang") or "",
            "premium_tg": bool(reg.get("premium")),
            "first_seen": first_seen or None,
            "last_seen": last_seen or None,
            "opens": int(reg.get("opens") or 0),
            "active_days": len(active_days),
            "devices": len(devices) or len(reg.get("devices") or {}),
            "minutes": round(listens["seconds"] / 60),
            "plays": listens["plays"],
            "tracks": len(listens["tracks"]),
            "favorites": len(shared.get("favorites") or []),
            "playlists": len(shared.get("playlists") or []),
            "follows": len(shared.get("followedArtists") or []),
            "plus_until": until or None,
            "plus_active": until > now,
            "plus_via": (history[-1].get("via") if history else "") or "",
            "in_events": uid in event_users,
            "top_artists": [name for name, _ in top_artists],
            "_days": sorted(active_days),
        })

    # ---- activity: who was around today / this week / this month
    def active_since(days: int) -> int:
        edge = metrics.day_key(now - (days - 1) * DAY)
        return sum(1 for r in rows if r["_days"] and r["_days"][-1] >= edge)

    series_days = [metrics.day_key(now - i * DAY) for i in range(29, -1, -1)]
    dau = {d: 0 for d in series_days}
    new = {d: 0 for d in series_days}
    minutes = {d: 0.0 for d in series_days}
    plays = {d: 0 for d in series_days}
    for r in rows:
        for d in r["_days"]:
            if d in dau:
                dau[d] += 1
        if r["first_seen"]:
            fk = metrics.day_key(r["first_seen"])
            if fk in new:
                new[fk] += 1
    merged = _merge_listens(all_listens)
    for d in series_days:
        entry = merged["days"].get(d) or {}
        minutes[d] = round((entry.get("s") or 0) / 60, 1)
        plays[d] = entry.get("p") or 0

    counters = metrics.counters()
    count_names = sorted({name for day in counters.values() for name in day})
    counter_series = {name: [int((counters.get(d) or {}).get(name, 0)) for d in series_days] for name in count_names}

    def top(items, key, n=20):
        return sorted(items, key=key, reverse=True)[:n]

    top_tracks = top(
        [(t["track"] or {}, t["plays"], round(t["seconds"] / 60)) for t in merged["tracks"].values() if t.get("track")],
        key=lambda x: (x[1], x[2]),
    )
    top_artists = top(
        [(name, a["plays"], round(a["seconds"] / 60)) for name, a in merged["artists"].items()],
        key=lambda x: (x[2], x[1]),
    )

    returning = sum(1 for r in rows if r["active_days"] >= 2)
    summary_cards = {
        "users": len(rows),
        "with_account_sync": len(sync),
        "dau": active_since(1),
        "wau": active_since(7),
        "mau": active_since(30),
        "new_7d": sum(1 for r in rows if r["first_seen"] and r["first_seen"] >= now - 7 * DAY),
        "new_30d": sum(1 for r in rows if r["first_seen"] and r["first_seen"] >= now - 30 * DAY),
        "plus_active": sum(1 for r in rows if r["plus_active"]),
        "plus_ever": sum(1 for r in rows if r["plus_until"]),
        "returning": returning,
        "hours": round(merged["seconds"] / 3600, 1),
        "plays": merged["plays"],
        "favorites": sum(r["favorites"] for r in rows),
        "playlists": sum(r["playlists"] for r in rows),
        "avg_minutes_active_week": round(
            sum(r["minutes"] for r in rows if r["_days"] and r["_days"][-1] >= metrics.day_key(now - 6 * DAY))
            / max(1, active_since(7))
        ),
    }

    # Demographics and cohorts
    langs = collections.Counter(r.get("lang") or "unknown" for r in rows)
    demographics = {
        "languages": dict(langs.most_common(6)),
        "premium_tg_count": sum(1 for r in rows if r.get("premium_tg")),
        "premium_tg_pct": round((sum(1 for r in rows if r.get("premium_tg")) / max(1, len(rows))) * 100, 1),
        "single_device": sum(1 for r in rows if r.get("devices", 1) <= 1),
        "multi_device": sum(1 for r in rows if r.get("devices", 1) > 1),
        "cohorts": {
            "power": sum(1 for r in rows if r.get("minutes", 0) >= 60),
            "regular": sum(1 for r in rows if 10 <= r.get("minutes", 0) < 60),
            "casual": sum(1 for r in rows if 1 <= r.get("minutes", 0) < 10),
            "onlookers": sum(1 for r in rows if r.get("minutes", 0) < 1),
        },
    }

    # Hourly distribution in Moscow time (UTC+3)
    activity_hours = [0] * 24
    for r in rows:
        if r.get("last_seen"):
            h = time.gmtime(r["last_seen"] + 3 * 3600).tm_hour
            activity_hours[h] += 1

    cache_info = _cache_disk_stats()
    if preloader_status:
        cache_info.update(preloader_status)

    for r in rows:
        r.pop("_days", None)
    rows.sort(key=lambda r: r["last_seen"] or 0, reverse=True)
    return {
        "generated": int(now),
        "today": today,
        "cards": summary_cards,
        "system": _system_stats(),
        "cache": cache_info,
        "audio_dna": _audio_dna(),
        "genres": _top_genres(),
        "demographics": demographics,
        "activity_hours": activity_hours,
        "series": {"days": series_days, "dau": [dau[d] for d in series_days], "new": [new[d] for d in series_days],
                   "minutes": [minutes[d] for d in series_days], "plays": [plays[d] for d in series_days]},
        "counters": counter_series,
        "top_tracks": [{"title": t.get("title"), "artist": t.get("artist"), "plays": p, "minutes": m} for t, p, m in top_tracks],
        "top_artists": [{"name": n, "plays": p, "minutes": m} for n, p, m in top_artists],
        "users": rows,
        "codes": [
            {"code": code, "days": c.get("days"), "used": len(c.get("used") or {}), "limit": c.get("limit"), "off": bool(c.get("off"))}
            for code, c in (plus.get("codes") or {}).items()
        ],
    }
