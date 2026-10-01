from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class TrackCandidate(APIModel):
    id: str
    source: str
    source_id: str = Field(alias="sourceId")
    title: str
    artist: str = ""
    duration: int | None = None
    artwork: str | None = None
    source_url: str | None = Field(default=None, alias="sourceUrl")
    confidence: float | None = None
    album: str | None = None
    album_id: str | None = Field(default=None, alias="albumId")
    artist_id: str | None = Field(default=None, alias="artistId")


class TrackInfo(APIModel):
    id: str
    source: str
    source_id: str = Field(alias="sourceId")
    title: str
    artist: str = ""
    duration: int | None = None
    artwork: str | None = None
    source_url: str | None = Field(default=None, alias="sourceUrl")
    album: str | None = None
    album_id: str | None = Field(default=None, alias="albumId")
    artist_id: str | None = Field(default=None, alias="artistId")


class PlaybackInfo(APIModel):
    type: str
    url: str
    mime_type: str | None = Field(default=None, alias="mimeType")
    expires_at: str | None = Field(default=None, alias="expiresAt")


class ResolvedTrack(APIModel):
    track: TrackInfo
    playback: PlaybackInfo


class SearchResponse(APIModel):
    results: list[TrackCandidate]


class ResolveResponse(ResolvedTrack):
    pass


class AlbumSummary(APIModel):
    id: str
    title: str
    year: str | None = None
    cover: str | None = None
    type: str = "album"  # "album" or "single" — lets the UI shelve them separately
    # Which provider this album's id belongs to (e.g. "youtube_music",
    # "musicbrainz") — an artist's albums list can mix entries from more
    # than one source, so each one carries its own instead of assuming the
    # artist's own source applies to every album in the list.
    source: str = ""


class AlbumInfo(APIModel):
    id: str
    source: str
    title: str
    artist: str = ""
    artist_id: str | None = Field(default=None, alias="artistId")
    year: str | None = None
    cover: str | None = None
    tracks: list[TrackCandidate] = Field(default_factory=list)


class ArtistInfo(APIModel):
    id: str
    source: str
    name: str
    photo: str | None = None
    subscribers: str | None = None
    top_tracks: list[TrackCandidate] = Field(default_factory=list, alias="topTracks")
    albums: list[AlbumSummary] = Field(default_factory=list)


class AlbumResponse(AlbumInfo):
    pass


class ArtistResponse(ArtistInfo):
    pass


def public_track_id(source: str, source_id: str) -> str:
    return f"{source}:{source_id}"


def candidate_to_track(candidate: TrackCandidate) -> TrackInfo:
    return TrackInfo(
        id=candidate.id,
        source=candidate.source,
        source_id=candidate.source_id,
        title=candidate.title,
        artist=candidate.artist,
        duration=candidate.duration,
        artwork=candidate.artwork,
        source_url=candidate.source_url,
        album=candidate.album,
        album_id=candidate.album_id,
        artist_id=candidate.artist_id,
    )
