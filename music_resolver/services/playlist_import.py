"""Reads a playlist (or an album) from another music service by its link.

What comes back is a name and a list of ``{"title", "artist", "duration"}``
— enough for the app to find the same tracks in Нотка one by one. Only
YouTube / YouTube Music gives tracks that are playable as they are; those
carry a ready ``"track"`` as well.

Every service is read the way an ordinary visitor's browser reads a public
page, with no account: Spotify's embed page, Yandex Music's public API,
Apple Music's page data. A private playlist can't be read this way.
"""

import asyncio
import json
import re
from urllib.parse import parse_qs, urlparse

import httpx

from music_resolver.errors import AppError, ErrorCode

MAX_TRACKS = 300

_HEADERS = {
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "accept-language": "ru,en;q=0.8",
}


def _unreadable(message: str) -> AppError:
    return AppError(ErrorCode.RESOLVE_FAILED, message)


def _item(title: str | None, artist: str | None, duration_ms: float | int | None) -> dict | None:
    title = (title or "").strip()
    if not title:
        return None
    return {
        "title": title,
        "artist": (artist or "").strip(),
        "duration": round(duration_ms / 1000) if duration_ms else None,
    }


async def _get(url: str, **kwargs) -> httpx.Response:
    async with httpx.AsyncClient(timeout=20, headers=_HEADERS, follow_redirects=True) as client:
        return await client.get(url, **kwargs)


# ---------------------------------------------------------------- Spotify
async def _spotify(kind: str, item_id: str) -> dict:
    res = await _get(f"https://open.spotify.com/embed/{kind}/{item_id}")
    found = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', res.text, re.S)
    if res.status_code != 200 or not found:
        raise _unreadable("Spotify did not show this playlist")
    try:
        entity = json.loads(found.group(1))["props"]["pageProps"]["state"]["data"]["entity"]
    except (KeyError, TypeError, ValueError) as exc:
        raise _unreadable("Spotify did not show this playlist") from exc
    tracks = [_item(t.get("title"), t.get("subtitle"), t.get("duration")) for t in entity.get("trackList") or []]
    return {"service": "spotify", "name": entity.get("name") or entity.get("title") or "", "tracks": tracks}


# ----------------------------------------------------------- Yandex Music
def _yandex_tracks(raw_tracks: list) -> list:
    out = []
    for entry in raw_tracks or []:
        track = entry.get("track") if isinstance(entry, dict) and "track" in entry else entry
        if not isinstance(track, dict):
            continue
        title = track.get("title") or ""
        if track.get("version"):
            title = f"{title} ({track['version']})"
        artists = ", ".join(a.get("name", "") for a in track.get("artists") or [] if a.get("name"))
        out.append(_item(title, artists, track.get("durationMs")))
    return out


async def _yandex(path: str, album: bool = False) -> dict:
    res = await _get(f"https://api.music.yandex.net/{path}", params={"richTracks": "true"})
    try:
        result = res.json().get("result")
    except ValueError:
        result = None
    if res.status_code != 200 or not isinstance(result, dict):
        raise _unreadable("Yandex Music did not show this playlist")
    if album:
        raw = [track for volume in result.get("volumes") or [] for track in volume]
    else:
        raw = result.get("tracks") or []
    return {"service": "yandex", "name": result.get("title") or "", "tracks": _yandex_tracks(raw)}


# ------------------------------------------------------------ Apple Music
def _apple_items(node, out: list) -> None:
    if isinstance(node, dict):
        if node.get("title") and node.get("artistName"):
            out.append(_item(node.get("title"), node.get("artistName"), node.get("duration")))
            return
        for value in node.values():
            _apple_items(value, out)
    elif isinstance(node, list):
        for value in node:
            _apple_items(value, out)


async def _apple(url: str) -> dict:
    res = await _get(url)
    found = re.search(r'<script type="application/json" id="serialized-server-data">(.*?)</script>', res.text, re.S)
    if res.status_code != 200 or not found:
        raise _unreadable("Apple Music did not show this playlist")
    tracks: list = []
    try:
        _apple_items(json.loads(found.group(1)), tracks)
    except ValueError as exc:
        raise _unreadable("Apple Music did not show this playlist") from exc
    title = re.search(r'<meta property="og:title" content="([^"]*)"', res.text)
    name = title.group(1) if title else ""
    name = re.sub(r"\s+(on|в|—|-|\|)\s+Apple\s*Music.*$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"^(.*?)\s+by\s+.+$", r"\1", name) if "/album/" in url else name
    return {"service": "apple", "name": name.replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", '"'), "tracks": tracks}


# -------------------------------------------------- YouTube / YouTube Music
def _youtube_sync(provider, playlist_id: str) -> dict:
    from music_resolver.providers.youtube_music import map_album_track

    raw = provider._client().get_playlist(playlist_id, limit=MAX_TRACKS)
    tracks = []
    for entry in raw.get("tracks") or []:
        album = entry.get("album") or {}
        mapped = map_album_track(entry, "", album.get("id"), album.get("name"))
        if mapped is None:
            continue
        item = _item(mapped.title, mapped.artist, (mapped.duration or 0) * 1000)
        if item:
            item["track"] = mapped.model_dump(by_alias=True)
            tracks.append(item)
    return {"service": "youtube", "name": raw.get("title") or "", "tracks": tracks}


async def _youtube(provider, playlist_id: str) -> dict:
    if provider is None:
        raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "YouTube Music is not available")
    try:
        return await asyncio.wait_for(asyncio.to_thread(_youtube_sync, provider, playlist_id), timeout=40)
    except AppError:
        raise
    except Exception as exc:
        raise _unreadable("YouTube did not show this playlist") from exc


# ------------------------------------------------------------------ entry
async def read_playlist(url: str, youtube_music_provider=None) -> dict:
    url = (url or "").strip()
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    path = parsed.path

    try:
        if host == "open.spotify.com":
            found = re.search(r"/(playlist|album)/([A-Za-z0-9]+)", path)
            if found:
                data = await _spotify(found.group(1), found.group(2))
            else:
                raise AppError(ErrorCode.INVALID_SOURCE_URL, "Not a playlist link")
        elif re.fullmatch(r"music\.yandex\.(ru|com|by|kz|uz)", host):
            by_user = re.search(r"/users/([^/]+)/playlists/(\d+)", path)
            by_uuid = re.search(r"/playlists/([A-Za-z0-9.\-]+)", path)
            album = re.search(r"/album/(\d+)", path)
            if by_user:
                data = await _yandex(f"users/{by_user.group(1)}/playlists/{by_user.group(2)}")
            elif by_uuid:
                data = await _yandex(f"playlist/{by_uuid.group(1)}")
            elif album:
                data = await _yandex(f"albums/{album.group(1)}/with-tracks", album=True)
            else:
                raise AppError(ErrorCode.INVALID_SOURCE_URL, "Not a playlist link")
        elif host == "music.apple.com":
            if "/playlist/" in path or "/album/" in path:
                data = await _apple(url)
            else:
                raise AppError(ErrorCode.INVALID_SOURCE_URL, "Not a playlist link")
        elif host in {"music.youtube.com", "youtube.com", "m.youtube.com"}:
            playlist_id = (parse_qs(parsed.query).get("list") or [""])[0]
            if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", playlist_id):
                raise AppError(ErrorCode.INVALID_SOURCE_URL, "Not a playlist link")
            data = await _youtube(youtube_music_provider, playlist_id)
        else:
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "This service is not supported")
    except httpx.HTTPError as exc:
        raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, "The service did not answer") from exc

    tracks = [t for t in data["tracks"] if t][:MAX_TRACKS]
    if not tracks:
        raise _unreadable("The playlist is empty or private")
    return {"service": data["service"], "name": (data["name"] or "").strip()[:60], "tracks": tracks}
