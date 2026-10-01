import re
import unicodedata
from difflib import SequenceMatcher

from music_resolver.models import TrackCandidate

PENALTY_TERMS = {
    "remix": 0.16,
    "mix": 0.06,
    "live": 0.18,
    "slowed": 0.24,
    "sped": 0.22,
    "reverb": 0.18,
    "cover": 0.28,
    "karaoke": 0.28,
    "instrumental": 0.18,
    "nightcore": 0.24,
    "acoustic": 0.12,
    "edit": 0.08,
    "lyrics": 0.08,
    "visualizer": 0.05,
}

NOISE_WORDS = {"official", "video", "audio", "hd", "hq", "music", "lyrics"}


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[\[\]{}()|/\\:;,.!?\"'`~*_+=<>-]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def tokens(value: str) -> set[str]:
    return {token for token in normalize_text(value).split() if token and token not in NOISE_WORDS}


def score_candidate(query: str, candidate: TrackCandidate) -> float:
    q_norm = normalize_text(query)
    title_norm = normalize_text(candidate.title)
    artist_norm = normalize_text(candidate.artist)
    full_norm = normalize_text(f"{candidate.title} {candidate.artist}")
    q_tokens = tokens(query)
    full_tokens = tokens(full_norm)
    title_tokens = tokens(candidate.title)
    artist_tokens = tokens(candidate.artist)

    if not q_tokens or not full_tokens:
        return 0.0

    overlap = len(q_tokens & full_tokens) / max(len(q_tokens), 1)
    sequence = SequenceMatcher(None, q_norm, full_norm).ratio()
    title_sequence = SequenceMatcher(None, q_norm, title_norm).ratio()

    score = 0.45 * overlap + 0.25 * sequence + 0.20 * title_sequence

    if title_tokens and title_tokens.issubset(q_tokens):
        score += 0.08
    if artist_tokens and artist_tokens.issubset(q_tokens):
        score += 0.10
    if candidate.duration and 60 <= candidate.duration <= 600:
        score += 0.04

    for term, penalty in PENALTY_TERMS.items():
        candidate_has = term in full_tokens
        query_has = term in q_tokens
        if candidate_has and not query_has:
            score -= penalty

    if candidate.duration and (candidate.duration < 45 or candidate.duration > 900):
        score -= 0.12

    return round(max(0.0, min(1.0, score)), 4)


def rank_candidates(query: str, candidates: list[TrackCandidate]) -> list[TrackCandidate]:
    ranked = []
    for candidate in candidates:
        ranked.append(candidate.model_copy(update={"confidence": score_candidate(query, candidate)}))
    ranked.sort(key=lambda item: item.confidence or 0.0, reverse=True)
    return ranked
