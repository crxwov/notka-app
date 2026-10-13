import json
from pathlib import Path

DISK_CACHE_PATH = Path(__file__).resolve().parent.parent.parent.parent / "cache" / "itunes_catalog.json"


def load_disk_cache(artist_id_cache: dict[str, str | None], albums_cache: dict[str, list[dict]]) -> None:
    try:
        if DISK_CACHE_PATH.exists():
            data = json.loads(DISK_CACHE_PATH.read_text(encoding="utf-8"))
            artist_id_cache.update(data.get("artist_ids") or {})
            albums_cache.update(data.get("albums") or {})
    except Exception as exc:
        print(f"[itunes] could not read disk cache, starting fresh: {exc}")


def save_disk_cache(artist_id_cache: dict[str, str | None], albums_cache: dict[str, list[dict]]) -> None:
    try:
        DISK_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {"artist_ids": artist_id_cache, "albums": albums_cache}
        DISK_CACHE_PATH.write_text(json.dumps(payload), encoding="utf-8")
    except Exception as exc:
        print(f"[itunes] could not write disk cache: {exc}")
