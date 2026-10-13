import re
from music_resolver.models import AlbumSummary, TrackCandidate, public_track_id

SOURCE_NAME = "itunes"


def artwork(entry: dict) -> str | None:
    url = entry.get("artworkUrl100") or entry.get("artworkUrl60")
    if not url:
        return None
    return re.sub(r"/\d+x\d+bb\.", "/600x600bb.", url)


def duration_seconds(millis) -> int | None:
    return int(millis / 1000) if millis else None


def map_track(item: dict, album_name: str | None = None, album_id: str | None = None) -> TrackCandidate | None:
    track_id = item.get("trackId")
    if not track_id:
        return None
    track_id = str(track_id)
    return TrackCandidate(
        id=public_track_id(SOURCE_NAME, track_id),
        source=SOURCE_NAME,
        source_id=track_id,
        title=item.get("trackName") or "Unknown",
        artist=item.get("artistName") or "",
        duration=duration_seconds(item.get("trackTimeMillis")),
        artwork=artwork(item),
        source_url=item.get("trackViewUrl"),
        album=item.get("collectionName") or album_name,
        album_id=str(item.get("collectionId")) if item.get("collectionId") else album_id,
        artist_id=str(item.get("artistId")) if item.get("artistId") else None,
    )


def dedupe_albums(raw_albums: list[dict]) -> list[AlbumSummary]:
    best_by_key: dict[str, dict] = {}
    for entry in raw_albums:
        title = (entry.get("collectionName") or "").strip().lower()
        if not title:
            continue
        existing = best_by_key.get(title)
        if existing is None or (entry.get("releaseDate") or "9999") < (existing.get("releaseDate") or "9999"):
            best_by_key[title] = entry

    summaries = []
    for entry in best_by_key.values():
        track_count = entry.get("trackCount") or 0
        release_date = entry.get("releaseDate") or ""
        year = release_date[:4] if release_date else None
        summaries.append(
            AlbumSummary(
                id=str(entry["collectionId"]),
                title=entry.get("collectionName") or "Unknown album",
                year=year,
                cover=artwork(entry),
                type="single" if track_count and track_count <= 3 else "album",
                source=SOURCE_NAME,
            )
        )
    summaries.sort(key=lambda a: a.year or "0", reverse=True)
    return summaries
