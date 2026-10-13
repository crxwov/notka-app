from music_resolver.models import AlbumInfo, AlbumSummary, ArtistInfo, TrackCandidate, public_track_id
from music_resolver.providers.youtube_common import extract_youtube_id, music_youtube_url

SOURCE_NAME = "youtube_music"


def best_thumbnail_url(thumbnails: list[dict] | None) -> str | None:
    if not thumbnails:
        return None
    try:
        return thumbnails[-1].get("url")
    except (AttributeError, IndexError):
        return None


def artist_name_and_id(artists: list[dict] | None) -> tuple[str, str | None]:
    artists = artists or []
    name = ", ".join(a.get("name", "") for a in artists if a.get("name"))
    artist_id = None
    if artists:
        artist_id = artists[0].get("id")
    return name, artist_id


def length_to_seconds(length: str | None) -> int | None:
    if not length:
        return None
    try:
        total = 0
        for part in str(length).split(":"):
            total = total * 60 + int(part)
        return total
    except ValueError:
        return None


def map_search_item(item: dict) -> TrackCandidate | None:
    video_id = item.get("videoId")
    if not video_id or not extract_youtube_id(video_id):
        return None
    artist, artist_id = artist_name_and_id(item.get("artists"))
    artwork = best_thumbnail_url(item.get("thumbnails"))
    duration = item.get("duration_seconds")
    album = item.get("album") or {}
    return TrackCandidate(
        id=public_track_id(SOURCE_NAME, video_id),
        source=SOURCE_NAME,
        source_id=video_id,
        title=item.get("title") or "Unknown",
        artist=artist,
        duration=int(duration) if duration else None,
        artwork=artwork,
        source_url=music_youtube_url(video_id),
        album=album.get("name"),
        album_id=album.get("id"),
        artist_id=artist_id,
    )


def map_album_track(
    track: dict,
    fallback_artist: str,
    album_id: str | None,
    album_name: str | None,
    fallback_artwork: str | None = None,
) -> TrackCandidate | None:
    video_id = track.get("videoId")
    if not video_id or not extract_youtube_id(video_id):
        return None
    artist, artist_id = artist_name_and_id(track.get("artists"))
    artwork = best_thumbnail_url(track.get("thumbnails")) or fallback_artwork
    duration = track.get("duration_seconds")
    return TrackCandidate(
        id=public_track_id(SOURCE_NAME, video_id),
        source=SOURCE_NAME,
        source_id=video_id,
        title=track.get("title") or "Unknown",
        artist=artist or fallback_artist,
        duration=int(duration) if duration else None,
        artwork=artwork,
        source_url=music_youtube_url(video_id),
        album=album_name,
        album_id=album_id,
        artist_id=artist_id,
    )


def map_album(album_id: str, raw: dict) -> AlbumInfo:
    artists = raw.get("artists") or []
    artist_name, artist_id = artist_name_and_id(artists)
    title = raw.get("title") or "Unknown album"
    cover = best_thumbnail_url(raw.get("thumbnails"))
    year = raw.get("year")
    tracks: list[TrackCandidate] = []
    for track in raw.get("tracks") or []:
        candidate = map_album_track(track, artist_name, album_id, title, fallback_artwork=cover)
        if candidate:
            tracks.append(candidate)
    return AlbumInfo(
        id=album_id,
        source=SOURCE_NAME,
        title=title,
        artist=artist_name,
        artist_id=artist_id,
        year=str(year) if year is not None else None,
        cover=cover,
        tracks=tracks,
    )


def map_artist_album_summary(entry: dict, release_type: str = "album") -> AlbumSummary | None:
    browse_id = entry.get("browseId")
    if not browse_id:
        return None
    year = entry.get("year")
    return AlbumSummary(
        id=browse_id,
        title=entry.get("title") or "Unknown album",
        year=str(year) if year is not None else None,
        cover=best_thumbnail_url(entry.get("thumbnails")),
        type=release_type,
        source=SOURCE_NAME,
    )


def map_artist(artist_id: str, raw: dict, client=None) -> ArtistInfo:
    name = raw.get("name") or "Unknown artist"
    photo = best_thumbnail_url(raw.get("thumbnails"))
    subscribers = raw.get("subscribers")

    songs = raw.get("songs") or {}
    song_entries = songs.get("results") or []
    if client is not None and songs.get("browseId"):
        try:
            full_playlist = client.get_playlist(songs["browseId"], limit=None)
            full_tracks = full_playlist.get("tracks") if isinstance(full_playlist, dict) else None
            if full_tracks:
                song_entries = full_tracks
        except Exception as exc:
            print(f"[artist:{artist_id}] full song list fetch failed, using preview: {exc}")

    top_tracks: list[TrackCandidate] = []
    for song in song_entries:
        candidate = map_album_track(song, name, None, None, fallback_artwork=photo)
        if candidate:
            top_tracks.append(candidate)

    album_section = raw.get("albums") or {}
    album_entries = album_section.get("results") or []
    if client is not None and album_section.get("params"):
        try:
            full_albums = client.get_artist_albums(
                album_section.get("browseId") or artist_id, album_section["params"]
            )
            if full_albums:
                album_entries = full_albums
        except Exception as exc:
            print(f"[artist:{artist_id}] full album list fetch failed, using preview: {exc}")

    singles_section = raw.get("singles") or {}
    single_entries = singles_section.get("results") or []
    if client is not None and singles_section.get("params"):
        try:
            full_singles = client.get_artist_albums(
                singles_section.get("browseId") or artist_id, singles_section["params"]
            )
            if full_singles:
                single_entries = full_singles
        except Exception as exc:
            print(f"[artist:{artist_id}] full singles list fetch failed, using preview: {exc}")

    search_entries: list[tuple[dict, str]] = []
    if client is not None and name:
        try:
            hits = client.search(name, filter="albums", limit=50) or []
        except Exception as exc:
            print(f"[artist:{artist_id}] search fallback (albums) failed: {exc}")
            hits = []
        matched = [
            h for h in hits
            if any((a.get("id") == artist_id or a.get("name") == name) for a in (h.get("artists") or []))
        ]
        search_entries.extend(
            (h, "single" if (h.get("type") or "").lower() in {"single", "ep"} else "album") for h in matched
        )

    albums: list[AlbumSummary] = []
    seen_album_ids: set[str] = set()
    tagged_entries = (
        [(e, "album") for e in album_entries] + [(e, "single") for e in single_entries] + search_entries
    )
    for entry, release_type in tagged_entries:
        summary = map_artist_album_summary(entry, release_type)
        if summary and summary.id not in seen_album_ids:
            seen_album_ids.add(summary.id)
            albums.append(summary)
    albums.sort(key=lambda a: a.year or "0", reverse=True)

    return ArtistInfo(
        id=artist_id,
        source=SOURCE_NAME,
        name=name,
        photo=photo,
        subscribers=str(subscribers) if subscribers else None,
        top_tracks=top_tracks,
        albums=albums,
    )
