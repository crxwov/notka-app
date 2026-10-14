import re
import unicodedata
from difflib import SequenceMatcher

from music_resolver.models import TrackCandidate

PENALTY_TERMS = {
    "remix": 0.35,
    "mix": 0.15,
    "live": 0.25,
    "slowed": 0.50,
    "sped": 0.50,
    "reverb": 0.45,
    "cover": 0.50,
    "karaoke": 0.50,
    "instrumental": 0.35,
    "nightcore": 0.50,
    "acoustic": 0.25,
    "edit": 0.30,
    "lyrics": 0.08,
    "visualizer": 0.05,
    "remake": 0.55,
    "reproduced": 0.55,
    "tribute": 0.50,
    "bootleg": 0.50,
    "beat": 0.40,
    "beatz": 0.40,
    "type": 0.40,
    "rework": 0.45,
    "mashup": 0.45,
    "leak": 0.45,
    "unreleased": 0.45,
    "snippet": 0.50,
    "ai": 0.55,
}

NOISE_WORDS = {"official", "video", "audio", "hd", "hq", "music", "lyrics"}


def strip_title_extras(title: str) -> str:
    cleaned = re.sub(r"\s*[\(\[][^\)\]]*(?:feat|ft\.|with|version|remaster|deluxe)[^\)\]]*[\)\]]", "", title or "", flags=re.I)
    cleaned = re.sub(r"\s*-\s*(?:feat\.|ft\.|with)\s+.*$", "", cleaned, flags=re.I)
    return cleaned.strip() or (title or "")


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[\[\]{}()|/\\:;,.!?\"'`~*_+=<>-]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def tokens(value: str) -> set[str]:
    return {token for token in normalize_text(value).split() if token and token not in NOISE_WORDS}


def score_candidate(query: str, candidate: TrackCandidate, index: int = 0) -> float:
    q_norm = normalize_text(query)
    clean_title = strip_title_extras(candidate.title)
    clean_title_norm = normalize_text(clean_title)
    title_norm = normalize_text(candidate.title)
    artist_norm = normalize_text(candidate.artist)
    album_norm = normalize_text(candidate.album or "")
    full_norm = normalize_text(f"{candidate.title} {candidate.artist} {candidate.album or ''}")
    title_artist_norm = normalize_text(f"{candidate.title} {candidate.artist}")
    q_tokens = tokens(query)
    full_tokens = tokens(full_norm)
    title_tokens = tokens(candidate.title)
    clean_title_tokens = tokens(clean_title)
    artist_tokens = tokens(candidate.artist)
    album_tokens = tokens(candidate.album or "")

    if not q_tokens or not full_tokens:
        return 0.0

    overlap = len(q_tokens & full_tokens) / max(len(q_tokens), 1)
    clean_title_seq = SequenceMatcher(None, q_norm, clean_title_norm).ratio()
    title_seq = SequenceMatcher(None, q_norm, title_norm).ratio()
    full_seq = SequenceMatcher(None, q_norm, full_norm).ratio()
    title_artist_seq = SequenceMatcher(None, q_norm, title_artist_norm).ratio()

    best_title_seq = max(clean_title_seq, title_seq)

    # When query specifically searches for the song title (or title is an exact match),
    # don't penalize the candidate simply because its artist name has multiple collaborators
    if best_title_seq >= 0.80 or (clean_title_tokens and clean_title_tokens == q_tokens):
        best_seq = max(best_title_seq, title_artist_seq)
    else:
        best_seq = max(full_seq, title_artist_seq)

    score = 0.45 * overlap + 0.35 * best_seq + 0.10 * best_title_seq

    if clean_title_tokens and clean_title_tokens.issubset(q_tokens):
        score += 0.08
    elif title_tokens and title_tokens.issubset(q_tokens):
        score += 0.08
    if artist_tokens and artist_tokens.issubset(q_tokens):
        score += 0.10
    if album_tokens and (album_tokens & q_tokens) and (artist_tokens & q_tokens):
        score += 0.12

    # If title has NO query tokens and album has NO query tokens, and candidate is not by the queried artist:
    # A candidate that only matched random words in artist name must not beat real songs
    if not (clean_title_tokens & q_tokens) and not (album_tokens & q_tokens) and not (artist_tokens and artist_tokens.issubset(q_tokens)):
        score -= 0.30

    if candidate.duration and 60 <= candidate.duration <= 600:
        score += 0.04

    # Position prior: preserve provider ranking for genuine hits
    score += max(0.0, 0.15 - 0.015 * index)

    for term, penalty in PENALTY_TERMS.items():
        candidate_has = term in full_tokens
        query_has = term in q_tokens
        if candidate_has and not query_has:
            score -= penalty

    haystack = f"{candidate.title} {candidate.artist}".lower()
    if re.search(r"\bprod\.?\s+[a-z0-9_]+|\bprod by\b|\btype beat\b", haystack) and not re.search(r"\bprod\b|\bbeat\b", q_norm):
        score -= 0.40

    if candidate.duration and (candidate.duration < 45 or candidate.duration > 900):
        score -= 0.12

    return round(max(0.0, min(1.0, score)), 4)


def rank_candidates(query: str, candidates: list[TrackCandidate]) -> list[TrackCandidate]:
    ranked = []
    for idx, candidate in enumerate(candidates):
        score = score_candidate(query, candidate, idx)
        ranked.append((score, idx, candidate.model_copy(update={"confidence": score})))
    ranked.sort(key=lambda item: (item[0], -item[1]), reverse=True)
    return [item[2] for item in ranked]

