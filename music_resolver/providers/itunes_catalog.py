"""iTunes Search API as a *catalog* source only.

Third attempt at this role (see the removed spotify.py and musicbrainz.py):
this provider never plays audio itself — it only supplies search/album/
artist metadata. Spotify's Web API turned out to require a Premium
subscription even for app-only access (a 200 OK token fetch followed by a
403 Forbidden on every real call). MusicBrainz's free search cluster turned
out to have sustained, not just occasional, overload (routine 503s that
didn't clear up with retries or a backoff budget). Apple's iTunes Search
API is also free and keyless, but is backed by Apple's own infrastructure
rather than a volunteer-run project, and has been reliably fast in
practice — no per-IP handshake, no documented 1 req/sec ceiling to work
around.

When a track actually needs to *play*, this provider looks it up by title
+ artist against a YouTube-backed provider (passed in at construction) using
the same text-similarity matcher the search endpoint uses, and delegates
playback (resolve + the actual audio download) to that match. The track
identity shown to the rest of the app (id, source="itunes", duration,
artwork, ...) stays iTunes's own — only the underlying audio bytes come
from YouTube.
"""

import asyncio
import json
import re
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import httpx

from music_resolver.config import Settings
from music_resolver.errors import AppError, ErrorCode
from music_resolver.models import (
    AlbumInfo,
    AlbumSummary,
    ArtistInfo,
    ResolvedTrack,
    TrackCandidate,
    candidate_to_track,
    public_track_id,
)
from difflib import SequenceMatcher

from music_resolver.providers.youtube_music import OFFICIAL_VIDEO_TYPES
from music_resolver.services.matcher import PENALTY_TERMS, normalize_text, rank_candidates, tokens

SOURCE_NAME = "itunes"
_SEARCH_URL = "https://itunes.apple.com/search"
_LOOKUP_URL = "https://itunes.apple.com/lookup"

# Persisted to disk so restarts (frequent during development, rare but not
# never in real use) don't force re-fetching an artist's whole discography.
_DISK_CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "cache" / "itunes_catalog.json"


_CATALOG_CACHE_VERSION = 3


def _artwork(entry: dict) -> str | None:
    # artworkUrl100 is a small thumbnail — bump it to a larger size the way
    # every iTunes API consumer does, by editing the size in the filename.
    url = entry.get("artworkUrl100") or entry.get("artworkUrl60")
    if not url:
        return None
    return re.sub(r"/\d+x\d+bb\.", "/600x600bb.", url)


def _duration_seconds(millis) -> int | None:
    return int(millis / 1000) if millis else None


def _strip_title_extras(text: str) -> str:
    """Drop bracketed suffixes and featuring credits before comparing
    titles — YouTube upload titles routinely carry "(feat. X)", "(Official
    Video)", "[Prod. Y]" etc. that have nothing to do with whether it's the
    same song, and left in would otherwise drag a correct match's token
    overlap down below the threshold."""
    text = re.sub(r"\([^)]*\)", " ", text or "")
    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = re.split(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", text, flags=re.IGNORECASE)[0]
    return text


# Matches a leading "<something> - " / "<something>: " / "<something> — "
# clause at the very start of a title — the shape a plain-YouTube upload
# title takes when it leads with the artist ("Travis Scott - LOOOVE
# (Lyrics)"). Only ever used together with _looks_like_artist_prefix below,
# which checks the captured clause actually names our artist before anyone
# strips it.
_TITLE_LEADING_CLAUSE_RE = re.compile(r"^\s*([^-–—:]+)[-–—:]\s*")


def _leading_artist_prefix_clause(candidate_title: str, primary_artist: str) -> str | None:
    """Returns the leading "Artist - " clause text (e.g. "Travis Scott - ")
    when the candidate title genuinely opens with our artist's name, else
    None. Shared by both the title-stripping and the artist check below, so
    the two agree on exactly what counts as "the artist named themselves at
    the front of this title" — see each caller's docstring for why that
    distinction matters."""
    match = _TITLE_LEADING_CLAUSE_RE.match(candidate_title or "")
    if not match:
        return None
    clause_tok = tokens(match.group(1))
    artist_tok = tokens(primary_artist)
    if not clause_tok or not artist_tok:
        return None
    # Containment of the artist's own tokens in the clause, not Jaccard —
    # a clause can legitimately list several artists ("Travis Scott, Don
    # Toliver - CHAMPAIN & VACAY") and still be exactly our artist's prefix;
    # Jaccard would punish that for having "extra" names in it.
    if len(clause_tok & artist_tok) / len(artist_tok) >= 0.8:
        return match.group(0)
    return None


def _strip_leading_artist_prefix(candidate_title: str, primary_artist: str) -> str:
    """Peel off a leading "Artist - " (or ": " / " — ") clause from a plain
    YouTube upload title when that clause actually names our artist.

    Plain-YouTube (non-YouTube-Music) upload titles almost always lead with
    the artist name — "Travis Scott - LOOOVE (Lyrics)" for a song whose real
    title is just "LOOOVE". Left in, that prefix dilutes the token-overlap
    title comparison below: a short real title like "LOOOVE" barely
    overlaps "Travis Scott - LOOOVE" as a whole (2 of its 3 tokens are the
    artist's own name, not the song's), so a correct candidate would
    otherwise fail the title check purely because of how its uploader
    formatted the title — this was silently rejecting almost every
    plain-YouTube fallback match. Guarded so a title that genuinely starts
    with a dash-separated clause of its own (not the artist) is untouched.
    """
    clause = _leading_artist_prefix_clause(candidate_title, primary_artist)
    return candidate_title[len(clause):] if clause else candidate_title


def _title_matches(query_title: str, candidate_title: str, primary_artist: str = "") -> bool:
    """Independent, title-only check — deliberately ignores artist/album
    context so a same-artist-wrong-song candidate can't sneak through on a
    blended score (see _match_on_youtube's comment for the bug this fixes).

    Uses Jaccard (intersection / union of tokens) rather than a one-way
    "query tokens are a subset of candidate tokens" check — a one-way check
    let a short title like "FATHER" match a candidate titled "Father
    Stretch My Hands Pt. 1" just because "father" is contained in it, which
    was a real wrong-match case seen in production logs."""
    candidate_title = _strip_leading_artist_prefix(candidate_title, primary_artist)
    q_stripped = _strip_title_extras(query_title)
    c_stripped = _strip_title_extras(candidate_title)
    q_norm = normalize_text(q_stripped)
    c_norm = normalize_text(c_stripped)
    if not q_norm or not c_norm:
        return False
    if q_norm == c_norm:
        return True
    q_tok = tokens(q_stripped)
    c_tok = tokens(c_stripped)
    if not q_tok or not c_tok:
        return False
    jaccard = len(q_tok & c_tok) / len(q_tok | c_tok)
    seq = SequenceMatcher(None, q_norm, c_norm).ratio()
    return jaccard >= 0.5 or seq >= 0.75


_CYR_TO_LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def _to_latin(text: str) -> str:
    return "".join(_CYR_TO_LAT.get(ch, ch) for ch in (text or "").lower())


def _artist_matches(query_artist: str, candidate_title: str, candidate_artist: str) -> bool:
    """Independent, artist-only check — a candidate titled identically by a
    different, similarly-named artist ("Travis" vs "Travis Scott") must not
    pass just because the title matched perfectly.

    Checked against the candidate's own "artist" field plus (only) a
    genuine leading "Artist - " clause in its title, via the same
    _leading_artist_prefix_clause used for title-stripping — for a plain-
    YouTube result the "artist" field is really just the uploading
    channel's name ("Vibe Music", "MusicOnly", "Lost Elephant"...), which
    has nothing to do with who actually performs the song, while the
    upload's title almost always leads with it ("Travis Scott - ...").
    Using the artist field alone made this check fail for essentially
    every plain-YouTube candidate.

    Deliberately NOT checking the artist's name against the *whole* title
    (only its leading clause) — an earlier version of this check did that
    and let through wrong matches like "THANK GOD (Travis Scott Vocal
    Remix)" by a completely different uploader ("Lakee Jordan"), or "Til
    Further Notice (8-Bit Travis Scott Emulation)" by "8-Bit Arcade": the
    real artist's name appearing anywhere in a parenthetical credit ("...
    Vocal Remix", "... Emulation") isn't the same as it being the actual
    performer, and a video whose title *opens* with a totally different
    artist ("8-Bit Arcade - ...") must not pass just because "Travis Scott"
    is mentioned later as who got remixed/covered.
    """
    q_tok = tokens(query_artist)
    if not q_tok:
        return True  # nothing to check against
    prefix_clause = _leading_artist_prefix_clause(candidate_title, query_artist) or ""
    c_tok = tokens(candidate_artist) | tokens(prefix_clause)
    overlap = len(q_tok & c_tok) / len(q_tok)
    if overlap >= 0.8:
        return True

    # Transliteration fallback: compare in Latin characters (Kino <-> Кино, Splean <-> Сплин)
    q_lat_tok = tokens(_to_latin(query_artist))
    c_lat_tok = tokens(_to_latin(candidate_artist)) | tokens(_to_latin(prefix_clause))
    if q_lat_tok and c_lat_tok:
        lat_overlap = len(q_lat_tok & c_lat_tok) / len(q_lat_tok)
        if lat_overlap >= 0.8:
            return True
        q_str = " ".join(sorted(q_lat_tok))
        c_str = " ".join(sorted(c_lat_tok))
        if SequenceMatcher(None, q_str, c_str).ratio() >= 0.75:
            return True
    return False


# Multi-word tells for a fan edit/cover/novelty upload that a plain word-list
# can't catch (matcher.PENALTY_TERMS below handles the single-word ones:
# "remix", "cover", "karaoke", "instrumental", "nightcore", ...). These
# don't get cleaned out by _strip_title_extras (they're often inside the
# parenthetical, which comparison ignores) or caught by _title_matches /
# _artist_matches (they can even *contain* the real artist's name, e.g.
# "Originally Performed by Travis Scott and Don Toliver", and still pass
# both checks) — so the song title looks right and the "artist" appears to
# check out, while the audio itself is someone else's cover, remix, or
# novelty edit of it.
_UNOFFICIAL_PHRASE_RE = re.compile(
    r"[a-z0-9]+'?s version"  # "fha's Version", "DJ Whoever's Version"
    r"|originally performed by"
    r"|as made famous by"
    r"|in the style of"
    r"|tribute to"
    r"|\b8[- ]?bit\b"
    r"|\bchipmunk(?:ed)?\b"
    r"|\bemulation\b"
    r"|\btype beat\b"
    r"|\bremake\b"
    r"|\bflip\b"
    r"|\breproduced\b"
    r"|\bre-produced\b"
    r"|\bre-recorded\b"
    r"|\bbootleg\b"
    r"|\bai cover\b"
    r"|\bai vocals?\b"
    r"|\bprod\.?\s+[a-z0-9_]+"
    r"|\bprod by\b"
    r"|\binstrumental remake\b",
    re.IGNORECASE,
)


_HARD_UNOFFICIAL_TERMS = {
    "remix", "slowed", "sped", "reverb", "cover", "karaoke",
    "instrumental", "nightcore", "remake", "reproduced", "tribute",
    "bootleg", "rework", "mashup", "leak", "unreleased", "snippet", "ai",
}


def _looks_unofficial(candidate_title: str, candidate_artist: str, query_title: str) -> bool:
    """True when a candidate's title/artist carries a fan-edit/cover/remix
    signal that the query itself doesn't ask for — "JACKBOYS - JB2 RADIO
    (fha's Version)", "THANK GOD (Travis Scott Vocal Remix)", "Champain &
    Vacay (Originally Performed by Travis Scott and Don Toliver)". Title and
    artist checks alone can't catch these: the title still reduces to the
    right song name once "(...)" is stripped, and the real artist's name
    can appear inside that same parenthetical without them being the actual
    performer. Query-aware (via the "and the query doesn't already say so"
    check) so a track genuinely titled e.g. "... (Sped Up)" isn't blocked
    from matching itself.
    """
    haystack = f"{candidate_title} {candidate_artist}"
    query_tok = tokens(query_title)
    if _UNOFFICIAL_PHRASE_RE.search(haystack) and not _UNOFFICIAL_PHRASE_RE.search(query_title or ""):
        return True
    single_word_hits = _HARD_UNOFFICIAL_TERMS & tokens(haystack)
    if single_word_hits - query_tok:
        return True
    # …and the other way round: a track that IS a remix / live cut / sped-up
    # version must not be matched to the plain original.
    return bool((_HARD_UNOFFICIAL_TERMS & query_tok) - tokens(haystack))


# How far a video's length may be from the iTunes track's own length and
# still count as the same recording. An artist-credited video can carry a
# short intro; a user upload gets almost no slack, because its length is the
# only real evidence that it is the original audio and not an edit.
_OFFICIAL_VIDEO_TOLERANCE = 15
_USER_UPLOAD_TOLERANCE = 5

# What a user upload's title may say besides the artist and the song name.
_UPLOAD_FILLER = {
    "lyric", "ft", "feat", "featuring", "with", "by", "x", "and", "4k", "explicit", "visualizer",
    "перевод", "текст", "слова", "клип", "с", "c", "русскими", "субтитрами", "субтитры",
}


def _user_upload_title_matches(query_title: str, artist: str, primary_artist: str, candidate_title: str) -> bool:
    """A user upload passes only when its title is the artist plus the song
    name and nothing else of substance: "Kendrick Lamar Not like us Lyrics
    Video" does, "Eminem ft. Kendrick Lamar - Not Like Us [2024]" does not."""
    required = tokens(_strip_title_extras(query_title)) | tokens(primary_artist)
    allowed = tokens(query_title) | tokens(artist) | _UPLOAD_FILLER
    have = {tok for tok in tokens(candidate_title) if any(ch.isalnum() for ch in tok)}
    if not required or not required <= have:
        return False
    return len(have - allowed) <= 1


def _duration_close(expected: int | None, actual: int | None, tolerance: int, required: bool) -> bool:
    if not expected or not actual:
        return not required
    return abs(expected - actual) <= tolerance


class ITunesCatalogProvider:
    """Duck-types enough of MusicProvider to slot into ProviderManager, plus
    get_album/get_artist/download_to_file like the YouTube providers."""

    name = SOURCE_NAME

    def __init__(
        self,
        settings: Settings,
        youtube_provider,
        youtube_fallback_provider=None,
        soundcloud_provider=None,
    ) -> None:
        self.settings = settings
        self.youtube_provider = youtube_provider
        # Kept for wiring/back-compat only — NOT used to accept matches
        # anymore. It used to be a plain-YouTube search consulted when
        # YouTube Music's own catalog search came up empty, but that made
        # _match_on_youtube accept fan edits/remakes whose titles are
        # deliberately formatted to look official. See _match_on_youtube's
        # docstring for why that fallback was removed rather than tuned.
        self.youtube_fallback_provider = youtube_fallback_provider
        self.soundcloud_provider = soundcloud_provider
        self._last_request_at = 0.0
        self._rate_lock = asyncio.Lock()
        # iTunes track id -> matched youtube video id, so download_to_file
        # (called right after resolve() in the /stream flow) doesn't have
        # to redo the search-and-match work.
        self._match_cache: dict[str, str] = {}
        # track id -> its catalog entry, filled in by search/get_album/resolve
        # so a later resolve or download_to_file needs no API round trip.
        self._track_info_cache: dict[str, TrackCandidate] = {}
        self._artist_id_cache: dict[str, str | None] = {}
        self._albums_cache: dict[str, list[dict]] = {}
        self._album_cache: dict[str, tuple[float, AlbumInfo]] = {}
        self._cache_ttl = 3600.0  # only get_album (has track lists); the rest is cached forever
        self._load_disk_cache()

    @property
    def configured(self) -> bool:
        return True

    # ---------------- disk cache ----------------

    def _load_disk_cache(self) -> None:
        try:
            if _DISK_CACHE_PATH.exists():
                data = json.loads(_DISK_CACHE_PATH.read_text(encoding="utf-8"))
                self._artist_id_cache.update(data.get("artist_ids") or {})
                self._albums_cache.update(data.get("albums") or {})
                if data.get("version") == _CATALOG_CACHE_VERSION:
                    self._match_cache.update(data.get("matches") or {})
                else:
                    print(f"[itunes] match cache version changed ({data.get('version')} -> {_CATALOG_CACHE_VERSION}), resetting matches")
        except Exception as exc:
            print(f"[itunes] could not read disk cache, starting fresh: {exc}")

    def _save_disk_cache(self) -> None:
        try:
            _DISK_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "version": _CATALOG_CACHE_VERSION,
                "artist_ids": self._artist_id_cache,
                "albums": self._albums_cache,
                "matches": self._match_cache,
            }
            _DISK_CACHE_PATH.write_text(json.dumps(payload), encoding="utf-8")
        except Exception as exc:
            print(f"[itunes] could not write disk cache: {exc}")

    # ---------------- HTTP ----------------

    async def _get(self, url: str, params: dict) -> dict:
        async with self._rate_lock:
            elapsed = time.monotonic() - self._last_request_at
            if elapsed < 0.34:  # be a good citizen, ~3 req/sec max
                await asyncio.sleep(0.34 - elapsed)
            self._last_request_at = time.monotonic()
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(
                    timeout=self.settings.provider_timeout, proxy=self.settings.itunes_proxy
                ) as client:
                    # iTunes Search returns 403 for requests that look like
                    # a bare script client (httpx's default User-Agent is
                    # "python-httpx/...") — a normal browser-style
                    # User-Agent/Accept pair is enough to get through.
                    resp = await client.get(
                        url,
                        params=params,
                        headers={
                            "User-Agent": (
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                "AppleWebKit/537.36 (KHTML, like Gecko) "
                                "Chrome/128.0.0.0 Safari/537.36"
                            ),
                            "Accept": "application/json, text/javascript, */*",
                            # /search (not /lookup) has been observed
                            # returning a hard 403 for every request from a
                            # given IP regardless of retries — consistent
                            # with a WAF rule keyed on "looks like a script
                            # hitting /search with no page it came from".
                            # /lookup (by numeric id) never carries these and
                            # isn't blocked, which points at exactly that.
                            # These two headers are the standard fix for
                            # that class of iTunes-API 403 reported
                            # elsewhere; harmless to send on /lookup too.
                            "Referer": "https://music.apple.com/",
                            "Origin": "https://music.apple.com",
                        },
                    )
                    resp.raise_for_status()
                    return resp.json()
            except httpx.HTTPError as exc:
                last_exc = exc
                await asyncio.sleep(0.4 * (attempt + 1))
        raise AppError(ErrorCode.RESOLVE_FAILED, "iTunes request failed") from last_exc

    def _remember_artist_id(self, artist_name: str | None, artist_id) -> None:
        """Opportunistically fill _artist_id_cache from data we already
        have, so find_artist_id() (which otherwise has to hit
        /search?entity=musicArtist — the one endpoint that's been seen
        hard-403ing regardless of retries; /lookup never does) can skip
        straight to /lookup?entity=album for an artist whose id we picked
        up incidentally, e.g. from looking up one of their tracks. This is
        a resolved-tracks-only side channel, not a substitute for
        find_artist_id — an artist page opened before anything of theirs
        has ever been played still needs the search endpoint.
        """
        if not artist_name or not artist_id:
            return
        cache_key = artist_name.strip().lower()
        if cache_key and cache_key not in self._artist_id_cache:
            self._artist_id_cache[cache_key] = str(artist_id)
            self._save_disk_cache()

    async def _lookup_track_info(self, track_id: str) -> TrackCandidate:
        """The catalog entry for an iTunes track id, cached in memory. Shared
        by resolve() and download_to_file() so they don't each duplicate
        the lookup-and-cache dance."""
        cached = self._track_info_cache.get(track_id)
        if cached is not None:
            return cached
        data = await self._get(_LOOKUP_URL, {"id": track_id})
        items = data.get("results") or []
        candidate = self._map_track(items[0]) if items else None
        if candidate is None:
            raise AppError(ErrorCode.TRACK_NOT_FOUND, "No such track in the catalog")
        return candidate

    async def _matched_video(self, track_id: str, allow_soundcloud: bool = True) -> str:
        video_id = self._match_cache.get(track_id)
        if video_id and not allow_soundcloud and video_id.startswith("sc:"):
            video_id = None
        if not video_id:
            info = await self._lookup_track_info(track_id)
            video_id = await self._match_on_youtube(info.title, info.artist, info.duration, allow_soundcloud=allow_soundcloud)
            self._match_cache[track_id] = video_id
            self._save_disk_cache()
        return video_id

    async def ensure_matched(self, track_id: str) -> str | None:
        try:
            await self._matched_video(track_id)
            return self.matched_video_id(track_id)
        except Exception:
            return None

    # ---------------- MusicProvider surface ----------------

    async def search(self, query: str, limit: int) -> list[TrackCandidate]:
        data = await self._get(_SEARCH_URL, {"term": query, "entity": "song", "limit": limit})
        results = []
        for item in data.get("results") or []:
            candidate = self._map_track(item)
            if candidate:
                results.append(candidate)
        return results

    async def resolve(self, id_or_url: str) -> ResolvedTrack:
        track_id = self._extract_track_id(id_or_url)
        if not track_id:
            raise AppError(ErrorCode.INVALID_SOURCE_URL, "Unsupported or invalid iTunes URL")

        info = await self._lookup_track_info(track_id)
        target = await self._matched_video(track_id)
        if target.startswith("sc:") and self.soundcloud_provider:
            sc_target = target[3:]
            try:
                sc_resolved = await self.soundcloud_provider.resolve(sc_target)
                return ResolvedTrack(track=candidate_to_track(info), playback=sc_resolved.playback)
            except Exception as exc:
                print(f"[itunes] soundcloud playback failed for {track_id} ({sc_target}): {exc}, falling back to YouTube")
                self._match_cache.pop(track_id, None)
                self._save_disk_cache()
                target = await self._matched_video(track_id, allow_soundcloud=False)

        yt_resolved = await self.youtube_provider.resolve(target)
        return ResolvedTrack(track=candidate_to_track(info), playback=yt_resolved.playback)

    async def download_to_file(self, id_or_url: str, dest_dir: Path, dest_stem: str):
        track_id = self._extract_track_id(id_or_url) or id_or_url
        target = await self._matched_video(track_id)
        if target.startswith("sc:") and self.soundcloud_provider:
            sc_target = target[3:]
            try:
                return await self.soundcloud_provider.download_to_file(sc_target, dest_dir, dest_stem)
            except Exception as exc:
                print(f"[itunes] soundcloud download failed for {track_id} ({sc_target}): {exc}, falling back to YouTube")
                self._match_cache.pop(track_id, None)
                self._save_disk_cache()
                target = await self._matched_video(track_id, allow_soundcloud=False)

        return await self.youtube_provider.download_to_file(target, dest_dir, dest_stem)

    def can_handle_url(self, url: str) -> bool:
        try:
            host = urlparse(url).netloc.lower()
        except ValueError:
            return False
        return host.endswith("apple.com")

    def matched_video_id(self, track_id: str) -> str | None:
        """Whichever YouTube video id or SoundCloud target this iTunes track was last matched to
        (populated by resolve()/download_to_file() into _match_cache).

        Used by the /stream route to fold the matched video id into the
        on-disk audio cache key — that cache is otherwise keyed only by the
        stable iTunes track id, so a *correct* rematch (e.g. after a
        matching-logic fix, like the title+artist independence check or the
        youtube_web fallback) would silently keep serving whatever audio
        file an earlier, wrong match already downloaded and cached forever,
        with no way to tell the two apart. This is exactly why the wrong
        song kept playing even once the match log showed the right pick.
        """
        val = self._match_cache.get(track_id)
        if not val:
            return None
        if val.startswith("sc:"):
            clean = re.sub(r"[^A-Za-z0-9_.-]", "_", val[3:])
            return f"sc_{clean[-40:]}"
        return val

    @staticmethod
    def _extract_track_id(id_or_url: str) -> str | None:
        value = (id_or_url or "").strip()
        if not value:
            return None
        if value.isdigit():
            return value
        match = re.search(r"[?&]i=(\d+)", value) or re.search(r"/id(\d+)", value)
        return match.group(1) if match else None

    async def _match_on_youtube(
        self, title: str, artist: str, duration: int | None = None, allow_soundcloud: bool = True
    ) -> str:
        """Find the playback audio that carries this iTunes track's audio.

        Priority order:
        1. YouTube Music's own catalog ("songs") — official streaming audio.
        2. Videos YouTube Music itself credits to the artist.
        3. SoundCloud official/matching track (checked BEFORE random YouTube user uploads!).
        4. YouTube user upload (strict title + length check, rejecting remakes/beats).
        """
        primary_artist = artist.split(",")[0].strip() if artist else artist
        primary_artist = re.split(r"\bfeat\.?\b|\bft\.?\b|&", primary_artist, flags=re.IGNORECASE)[0].strip()
        query = f"{title} {primary_artist}".strip()

        # 1. YouTube catalog search
        accepted, ranked = await self._search_and_match(self.youtube_provider, query, title, primary_artist, duration)
        via = "catalog"

        # 2. YouTube official artist-credited videos
        if accepted is None:
            accepted, via = await self._match_among_videos(query, title, artist, primary_artist, duration, official_only=True)

        # 3. SoundCloud official release/upload (checked before random YouTube user uploads)
        if accepted is None and allow_soundcloud and self.soundcloud_provider:
            sc_match = await self._match_on_soundcloud(title, artist, primary_artist, duration)
            if sc_match is not None:
                accepted = sc_match
                via = "soundcloud"

        # 4. YouTube user upload as last resort
        if accepted is None:
            accepted, via = await self._match_among_videos(query, title, artist, primary_artist, duration, official_only=False)

        print(
            f"[itunes match] query={query!r} -> "
            + (f"accepted via {via}: {accepted.title!r} by {accepted.artist!r} ({accepted.source_id})" if accepted else "NOT FOUND")
            + " (top catalog results: "
            + ", ".join(f"{c.title!r}/{c.artist!r}/{c.confidence}" for c in ranked[:5])
            + ")"
        )
        if accepted is None:
            raise AppError(ErrorCode.TRACK_NOT_FOUND, "Track not found in available catalogs")
        if via == "soundcloud":
            return f"sc:{accepted.source_url or accepted.source_id}"
        return accepted.source_id

    async def _match_on_soundcloud(
        self, title: str, artist: str, primary_artist: str, duration: int | None
    ) -> TrackCandidate | None:
        if not self.soundcloud_provider:
            return None
        query = f"{title} {primary_artist}".strip()
        try:
            candidates = await self.soundcloud_provider.search(query, 8)
        except Exception as exc:
            print(f"[itunes match] soundcloud search failed: {exc}")
            return None
        if not candidates:
            return None

        valid = []
        for c in candidates:
            if _looks_unofficial(c.title, c.artist, title):
                continue
            if not _title_matches(title, c.title, primary_artist):
                continue
            if not _artist_matches(primary_artist, c.title, c.artist):
                continue
            if duration and c.duration and abs(c.duration - duration) > 25:
                continue
            ch = (c.artist or "").lower()
            if any(bad in ch for bad in ("prod", "beat", "beatz", "remake", "archive", "reverb", "slowed", "type", "edits", "instr")):
                continue
            valid.append(c)

        if not valid:
            return None
        return min(valid, key=lambda c: abs((c.duration or 0) - duration) if duration and c.duration else 0)

    async def _match_among_videos(
        self, query: str, title: str, artist: str, primary_artist: str, duration: int | None, official_only: bool = False
    ) -> tuple[TrackCandidate | None, str]:
        search_videos = getattr(self.youtube_provider, "search_videos", None)
        if search_videos is None:
            return None, ""
        try:
            videos = await search_videos(query, 12)
        except Exception as exc:
            print(f"[itunes match] video search failed: {exc}")
            return None, ""

        def closest(candidates: list[TrackCandidate]) -> TrackCandidate | None:
            if not candidates:
                return None
            return min(candidates, key=lambda c: abs((c.duration or 0) - duration) if duration and c.duration else 0)

        official, uploads = [], []
        for candidate, video_type in videos:
            if _looks_unofficial(candidate.title, candidate.artist, title):
                continue
            if video_type in OFFICIAL_VIDEO_TYPES:
                if (
                    _title_matches(title, candidate.title, primary_artist)
                    and _artist_matches(primary_artist, candidate.title, candidate.artist)
                    and _duration_close(duration, candidate.duration, _OFFICIAL_VIDEO_TOLERANCE, required=False)
                ):
                    official.append(candidate)
            elif not official_only and _user_upload_title_matches(title, artist, primary_artist, candidate.title) and _duration_close(
                duration, candidate.duration, _USER_UPLOAD_TOLERANCE, required=True
            ):
                ch = (candidate.artist or "").lower()
                if any(bad in ch for bad in ("prod", "beat", "beatz", "remake", "archive", "reverb", "slowed", "type", "edits", "instr")):
                    continue
                uploads.append(candidate)
        if official:
            return closest(official), "artist-credited video"
        if uploads:
            return closest(uploads), "user upload (title + length check)"
        return None, ""

    @staticmethod
    async def _search_and_match(
        provider, query: str, title: str, primary_artist: str, duration: int | None = None
    ) -> tuple[TrackCandidate | None, list[TrackCandidate]]:
        """Search one provider and apply the independent title+artist match
        check. Returns (accepted_or_None, ranked_candidates) — ranked is
        returned even on no-match so callers can log it."""
        try:
            yt_candidates = await getattr(provider, "search_songs", provider.search)(query, 8)
        except Exception as exc:
            print(f"[itunes match] search via {getattr(provider, 'name', provider)} failed: {exc}")
            return None, []
        if not yt_candidates:
            return None, []
        ranked = rank_candidates(query, yt_candidates)

        # rank_candidates' blended score compares "title + artist" as one
        # string, which is unreliable for short titles: a candidate with a
        # totally different (but same-artist) title can still score high
        # purely because the artist portion matches at length — that's
        # exactly what was causing wrong tracks to get picked and played
        # (e.g. query "DUMBO Travis Scott" matching a candidate titled
        # "MAFIA" by "Travis Scott" at confidence 0.69). So title and
        # artist are checked independently here, and BOTH must hold before
        # a candidate is accepted — the blended score only decides ordering
        # among candidates that already pass both checks.
        for candidate in ranked:
            if _looks_unofficial(candidate.title, candidate.artist, title):
                # A fan edit/cover/remix/novelty upload — its title can
                # still reduce to the right song name and even namedrop the
                # real artist (see _looks_unofficial's docstring), so this
                # has to be filtered out *before* the title+artist checks,
                # not left for them to catch. Skip it, don't reject the
                # whole search — a clean upload may well rank lower.
                continue
            if duration and candidate.duration and abs(candidate.duration - duration) > 20:
                # Reject fan snippets, short loops, or extended cuts that don't match the studio track length
                continue
            if _title_matches(title, candidate.title, primary_artist) and _artist_matches(
                primary_artist, candidate.title, candidate.artist
            ):
                return candidate, ranked
        return None, ranked

    def _map_track(self, item: dict, album_name: str | None = None, album_id: str | None = None) -> TrackCandidate | None:
        track_id = item.get("trackId")
        if not track_id:
            return None
        track_id = str(track_id)
        self._remember_artist_id(item.get("artistName"), item.get("artistId"))
        candidate = TrackCandidate(
            id=public_track_id(SOURCE_NAME, track_id),
            source=SOURCE_NAME,
            source_id=track_id,
            title=item.get("trackName") or "Unknown",
            artist=item.get("artistName") or "",
            duration=_duration_seconds(item.get("trackTimeMillis")),
            artwork=_artwork(item),
            source_url=item.get("trackViewUrl"),
            album=item.get("collectionName") or album_name,
            album_id=str(item.get("collectionId")) if item.get("collectionId") else album_id,
            artist_id=str(item.get("artistId")) if item.get("artistId") else None,
        )
        self._track_info_cache[track_id] = candidate
        return candidate

    # ---------------- catalog browsing ----------------

    async def find_artist_id(self, name: str) -> str | None:
        if not name:
            return None
        cache_key = name.strip().lower()
        if cache_key in self._artist_id_cache:
            return self._artist_id_cache[cache_key]

        result = await self._find_artist_id_via_musicartist_search(name)
        if result is None:
            # entity=musicArtist searches have been seen hard-403ing from
            # this IP regardless of retries or the Referer/Origin headers
            # in _get, while entity=song searches never have (nor has
            # /lookup) — that smells like a WAF rule keyed specifically on
            # "entity=musicArtist", a very recognizable scraper signature,
            # rather than a blanket block on /search. So when the direct
            # artist search comes back empty (including from a 403, which
            # AppError-wraps to a falsy result via the try/except below),
            # fall back to a plain song search for the artist's name and
            # read artistId off whichever result is actually credited to
            # them — a different query shape that, if the theory holds,
            # isn't the one being blocked.
            result = await self._find_artist_id_via_song_search(name)

        self._artist_id_cache[cache_key] = result
        self._save_disk_cache()
        return result

    async def _find_artist_id_via_musicartist_search(self, name: str) -> str | None:
        try:
            data = await self._get(_SEARCH_URL, {"term": name, "entity": "musicArtist", "limit": 5})
        except AppError as exc:
            print(f"[itunes] musicArtist search for {name!r} failed: {exc}")
            return None
        items = data.get("results") or []
        if not items:
            return None
        exact = [i for i in items if (i.get("artistName") or "").strip().lower() == name.strip().lower()]
        best = (exact or items)[0]
        return str(best.get("artistId")) if best.get("artistId") else None

    async def _find_artist_id_via_song_search(self, name: str) -> str | None:
        try:
            data = await self._get(
                _SEARCH_URL, {"term": name, "entity": "song", "attribute": "artistTerm", "limit": 25}
            )
        except AppError as exc:
            print(f"[itunes] song-search fallback for artist {name!r} failed too: {exc}")
            return None
        items = data.get("results") or []
        name_norm = name.strip().lower()
        exact = [i for i in items if (i.get("artistName") or "").strip().lower() == name_norm]
        for item in exact or items:
            if item.get("artistId"):
                artist_id = str(item["artistId"])
                print(f"[itunes] resolved artistId for {name!r} via song-search fallback: {artist_id}")
                return artist_id
        return None

    async def albums_for_artist_name(self, name: str) -> list[AlbumSummary]:
        """Look an artist up by display name (used to augment another
        provider's artist page, which only has the name in common with
        iTunes's own catalog — not a shared id) and return their full,
        deduplicated discography."""
        artist_id = await self.find_artist_id(name)
        if not artist_id:
            return []
        raw_albums = await self._fetch_all_albums(artist_id)
        return self._dedupe_albums(raw_albums)

    async def get_artist(self, artist_id: str, fast: bool = False) -> ArtistInfo:
        if fast:
            name = None
            cached_albums = self._albums_cache.get(artist_id)
            if cached_albums:
                names = Counter(a.get("artistName") for a in cached_albums if a.get("artistName"))
                name = names.most_common(1)[0][0] if names else None

            top_tracks: list[TrackCandidate] = []
            if not name:
                try:
                    data = await self._get(_LOOKUP_URL, {"id": artist_id, "entity": "song", "limit": 25})
                    for item in data.get("results") or []:
                        if not name and item.get("artistName"):
                            name = item.get("artistName")
                        candidate = self._map_track(item) if item.get("wrapperType") == "track" else None
                        if candidate:
                            top_tracks.append(candidate)
                except Exception as exc:
                    print(f"[itunes] fast lookup failed for artist {artist_id}: {exc}")

            find_artist_id = getattr(self.youtube_provider, "find_artist_id", None)
            if find_artist_id is not None and name:
                try:
                    yt_artist_id = await asyncio.wait_for(find_artist_id(name), timeout=3.5)
                    if yt_artist_id:
                        return await self.youtube_provider.get_artist(yt_artist_id, fast=True)
                except Exception as exc:
                    print(f"[itunes] fast YouTube lookup failed for artist {name!r}: {exc}")

            if not top_tracks:
                try:
                    data = await self._get(_LOOKUP_URL, {"id": artist_id, "entity": "song", "limit": 25})
                    for item in data.get("results") or []:
                        candidate = self._map_track(item) if item.get("wrapperType") == "track" else None
                        if candidate:
                            top_tracks.append(candidate)
                except Exception:
                    pass

            cached_albums = self._albums_cache.get(artist_id)
            albums = self._dedupe_albums(cached_albums) if cached_albums else []

            return ArtistInfo(
                id=artist_id,
                source=SOURCE_NAME,
                name=name or "Unknown artist",
                photo=top_tracks[0].artwork if top_tracks else None,
                subscribers=None,
                top_tracks=top_tracks,
                albums=albums,
            )

        raw_albums = await self._fetch_all_albums(artist_id)
        albums = self._dedupe_albums(raw_albums)
        # the name most of the albums carry — a single entry can be a joint release
        names = Counter(a.get("artistName") for a in raw_albums if a.get("artistName"))
        name = names.most_common(1)[0][0] if names else "Unknown artist"

        # iTunes has no photo and no "popular tracks" for an artist, so the
        # page would open empty. YouTube Music's page for the same name has
        # both (and takes its album shelf from this catalog anyway).
        find_artist_id = getattr(self.youtube_provider, "find_artist_id", None)
        if find_artist_id is not None and raw_albums:
            try:
                yt_artist_id = await asyncio.wait_for(find_artist_id(name), timeout=8.0)
                if yt_artist_id:
                    return await self.youtube_provider.get_artist(yt_artist_id, fast=False)
            except Exception as exc:
                print(f"[itunes] no YouTube Music page for artist {name!r}: {exc}")

        # No such page (a joint credit like "JACKBOYS & Travis Scott", a
        # name spelled differently there): the catalog's own top songs.
        top_tracks: list[TrackCandidate] = []
        try:
            data = await self._get(_LOOKUP_URL, {"id": artist_id, "entity": "song", "limit": 50})
            for item in data.get("results") or []:
                candidate = self._map_track(item) if item.get("wrapperType") == "track" else None
                if candidate:
                    top_tracks.append(candidate)
        except AppError as exc:
            print(f"[itunes] top songs for artist {artist_id} failed: {exc}")

        return ArtistInfo(
            id=artist_id,
            source=SOURCE_NAME,
            name=name or "Unknown artist",
            photo=top_tracks[0].artwork if top_tracks else None,
            subscribers=None,
            top_tracks=top_tracks,
            albums=albums,
        )

    async def _fetch_all_albums(self, artist_id: str) -> list[dict]:
        cached = self._albums_cache.get(artist_id)
        if cached is not None:
            return cached
        data = await self._get(_LOOKUP_URL, {"id": artist_id, "entity": "album", "limit": 200})
        # First result is the artist entity itself; the rest are albums.
        entries = [r for r in (data.get("results") or []) if r.get("wrapperType") == "collection"]
        self._albums_cache[artist_id] = entries
        self._save_disk_cache()
        return entries

    def _dedupe_albums(self, raw_albums: list[dict]) -> list[AlbumSummary]:
        # iTunes commonly lists near-duplicate entries (deluxe editions,
        # regional re-releases) — keep the earliest-dated copy of each
        # distinct title so the UI doesn't show duplicates.
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
                    cover=_artwork(entry),
                    type="single" if track_count and track_count <= 3 else "album",
                    source=SOURCE_NAME,
                )
            )
        summaries.sort(key=lambda a: a.year or "0", reverse=True)
        return summaries

    async def get_album(self, album_id: str) -> AlbumInfo:
        cached = self._album_cache.get(album_id)
        if cached and (time.monotonic() - cached[0]) < self._cache_ttl:
            return cached[1]

        data = await self._get(_LOOKUP_URL, {"id": album_id, "entity": "song"})
        results = data.get("results") or []
        collection = next((r for r in results if r.get("wrapperType") == "collection"), {})
        title = collection.get("collectionName") or "Unknown album"
        artist_name = collection.get("artistName") or ""
        artist_id = str(collection.get("artistId")) if collection.get("artistId") else None
        self._remember_artist_id(artist_name, collection.get("artistId"))
        cover = _artwork(collection)
        release_date = collection.get("releaseDate") or ""
        year = release_date[:4] if release_date else None

        tracks: list[TrackCandidate] = []
        for item in results:
            if item.get("wrapperType") != "track":
                continue
            candidate = self._map_track(item, album_name=title, album_id=album_id)
            if candidate:
                if not candidate.artwork:
                    candidate = candidate.model_copy(update={"artwork": cover})
                self._track_info_cache[candidate.source_id] = candidate
                tracks.append(candidate)
        # The lookup response already returns tracks in album order — no
        # re-sort needed (sorting the public "source:id" strings would
        # actually scramble it, since it's lexical not numeric).

        album_info = AlbumInfo(
            id=album_id,
            source=SOURCE_NAME,
            title=title,
            artist=artist_name,
            artist_id=artist_id,
            year=year,
            cover=cover,
            tracks=tracks,
        )
        self._album_cache[album_id] = (time.monotonic(), album_info)
        return album_info
