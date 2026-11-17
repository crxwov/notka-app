# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-17T10:43:56Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main (coordination only)

## Objective
Apply and verify an indexed audio-cache lookup optimization on the current production source after the owner said “окей чини”.

## Scope
- Production music_resolver/api/routes.py, confined to _is_track_cached and its file-list lookup.
- Preserve current production audio-budget behavior and all user data.
- Rollout uses an exact source hash, isolated candidate, backup and a service health check with rollback.
- No canonical backend source is present to update. Canonical repository: https://github.com/crxwov/notka-app.

## State
- Previous fix is live and the DNS target is still 5.227.61.107. The server source has changed since the earlier staged scan patch. Current production reported commit 283f4a9, SHA-256 ecef14d029c7e174a241c4c4a76d879ff7b8a94e00c2ddde67ff5c6f75d6d142. That release already fixes AUDIO_CACHE_MAX_MB=0; it still performs a wildcard disk scan per uncached playlist item.
- The prior source took 34.6 s on 6815 tracks. Against the current 283f4a9 production tree and actual 6762-track audio cache, the indexed variant completed the full 6822-track read-only scan in 0.62 s with one cache-list scan. Regression check covers direct and suffix matches, file invalidation and bounded directory enumeration.
- Current source was captured and hash-checked. The exact patch replays cleanly with zero fuzz. Next: apply it with a source backup, restart and verify origin/public cache playback and the startup preloader scan.
