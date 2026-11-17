# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-17T10:40:13Z
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
- The prior isolated benchmark spent 34.6 s on 6815 playlist tracks. The indexed variant scanned the current cache once and finished the same workload in 1.22 s. DNS and sample range requests remain healthy, though client-reported start delays persist.
- Next: rebase the exact change on the current production file, preserve current budget behavior, apply it and verify playback/cache plus the next hourly preloader scan.
