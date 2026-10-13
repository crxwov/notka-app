"""YouTube Music provider shim (modularized into music_resolver.providers.youtube)."""

from music_resolver.providers.youtube import (
    GENRE_QUERIES,
    MOODS,
    OFFICIAL_VIDEO_TYPES,
    RU_MOOD_QUERIES,
    SOURCE_NAME,
    YouTubeMusicProvider,
    YoutubeMusicProvider,
    map_album,
    map_album_track,
    map_artist,
    map_artist_album_summary,
    map_search_item,
)

__all__ = [
    "YouTubeMusicProvider",
    "YoutubeMusicProvider",
    "SOURCE_NAME",
    "OFFICIAL_VIDEO_TYPES",
    "map_search_item",
    "map_album_track",
    "map_album",
    "map_artist_album_summary",
    "map_artist",
    "MOODS",
    "RU_MOOD_QUERIES",
    "GENRE_QUERIES",
]
