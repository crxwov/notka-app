import re
from difflib import SequenceMatcher

from music_resolver.models import TrackCandidate
from music_resolver.providers.youtube_music import OFFICIAL_VIDEO_TYPES
from music_resolver.services.matcher import PENALTY_TERMS, normalize_text, rank_candidates, tokens

_TITLE_LEADING_CLAUSE_RE = re.compile(r"^\s*([^-–—:]+)[-–—:]\s*")

_UNOFFICIAL_PHRASE_RE = re.compile(
    r"[a-z0-9]+'?s version"
    r"|originally performed by"
    r"|as made famous by"
    r"|in the style of"
    r"|tribute to"
    r"|\b8[- ]?bit\b"
    r"|\bchipmunk(?:ed)?\b"
    r"|\bemulation\b",
    re.IGNORECASE,
)

_OFFICIAL_VIDEO_TOLERANCE = 15
_USER_UPLOAD_TOLERANCE = 5

_UPLOAD_FILLER = {
    "lyric", "ft", "feat", "featuring", "with", "prod", "by", "x", "and", "4k", "explicit", "visualizer",
    "перевод", "текст", "слова", "клип", "с", "c", "русскими", "субтитрами", "субтитры",
}


def strip_title_extras(text: str) -> str:
    text = re.sub(r"\([^)]*\)", " ", text or "")
    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = re.split(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", text, flags=re.IGNORECASE)[0]
    return text


def leading_artist_prefix_clause(candidate_title: str, primary_artist: str) -> str | None:
    match = _TITLE_LEADING_CLAUSE_RE.match(candidate_title or "")
    if not match:
        return None
    clause_tok = tokens(match.group(1))
    artist_tok = tokens(primary_artist)
    if not clause_tok or not artist_tok:
        return None
    if len(clause_tok & artist_tok) / len(artist_tok) >= 0.8:
        return match.group(0)
    return None


def strip_leading_artist_prefix(candidate_title: str, primary_artist: str) -> str:
    clause = leading_artist_prefix_clause(candidate_title, primary_artist)
    return candidate_title[len(clause):] if clause else candidate_title


def title_matches(query_title: str, candidate_title: str, primary_artist: str = "") -> bool:
    candidate_title = strip_leading_artist_prefix(candidate_title, primary_artist)
    q_stripped = strip_title_extras(query_title)
    c_stripped = strip_title_extras(candidate_title)
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


def artist_matches(query_artist: str, candidate_title: str, candidate_artist: str) -> bool:
    q_tok = tokens(query_artist)
    if not q_tok:
        return True
    prefix_clause = leading_artist_prefix_clause(candidate_title, query_artist) or ""
    c_tok = tokens(candidate_artist) | tokens(prefix_clause)
    overlap = len(q_tok & c_tok) / len(q_tok)
    return overlap >= 0.8


def looks_unofficial(candidate_title: str, candidate_artist: str, query_title: str) -> bool:
    haystack = f"{candidate_title} {candidate_artist}"
    query_tok = tokens(query_title)
    if _UNOFFICIAL_PHRASE_RE.search(haystack) and not _UNOFFICIAL_PHRASE_RE.search(query_title or ""):
        return True
    single_word_hits = set(PENALTY_TERMS) & tokens(haystack)
    if single_word_hits - query_tok:
        return True
    return bool((set(PENALTY_TERMS) & query_tok) - tokens(haystack))


def user_upload_title_matches(query_title: str, artist: str, primary_artist: str, candidate_title: str) -> bool:
    required = tokens(strip_title_extras(query_title)) | tokens(primary_artist)
    allowed = tokens(query_title) | tokens(artist) | _UPLOAD_FILLER
    have = {tok for tok in tokens(candidate_title) if any(ch.isalnum() for ch in tok)}
    if not required or not required <= have:
        return False
    return len(have - allowed) <= 1


def duration_close(expected: int | None, actual: int | None, tolerance: int, required: bool) -> bool:
    if not expected or not actual:
        return not required
    return abs(expected - actual) <= tolerance


async def search_and_match(
    provider, query: str, title: str, primary_artist: str
) -> tuple[TrackCandidate | None, list[TrackCandidate]]:
    try:
        yt_candidates = await getattr(provider, "search_songs", provider.search)(query, 8)
    except Exception as exc:
        print(f"[itunes match] search via {getattr(provider, 'name', provider)} failed: {exc}")
        return None, []
    if not yt_candidates:
        return None, []
    ranked = rank_candidates(query, yt_candidates)

    for candidate in ranked:
        if looks_unofficial(candidate.title, candidate.artist, title):
            continue
        if title_matches(title, candidate.title, primary_artist) and artist_matches(
            primary_artist, candidate.title, candidate.artist
        ):
            return candidate, ranked
    return None, ranked


async def match_among_videos(
    youtube_provider, query: str, title: str, artist: str, primary_artist: str, duration: int | None
) -> tuple[TrackCandidate | None, str]:
    search_videos = getattr(youtube_provider, "search_videos", None)
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
        if looks_unofficial(candidate.title, candidate.artist, title):
            continue
        if video_type in OFFICIAL_VIDEO_TYPES:
            if (
                title_matches(title, candidate.title, primary_artist)
                and artist_matches(primary_artist, candidate.title, candidate.artist)
                and duration_close(duration, candidate.duration, _OFFICIAL_VIDEO_TOLERANCE, required=False)
            ):
                official.append(candidate)
        elif user_upload_title_matches(title, artist, primary_artist, candidate.title) and duration_close(
            duration, candidate.duration, _USER_UPLOAD_TOLERANCE, required=True
        ):
            uploads.append(candidate)
    if official:
        return closest(official), "artist-credited video"
    if uploads:
        return closest(uploads), "user upload (title + length check)"
    return None, ""
