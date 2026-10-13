from music_resolver.providers.youtube.mappers import (
    SOURCE_NAME,
    map_album,
    map_album_track,
    map_artist,
    map_artist_album_summary,
    map_search_item,
)
from music_resolver.providers.youtube.moods import GENRE_QUERIES, MOODS, RU_MOOD_QUERIES
from music_resolver.providers.youtube.provider import OFFICIAL_VIDEO_TYPES, YouTubeMusicProvider

YoutubeMusicProvider = YouTubeMusicProvider

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
