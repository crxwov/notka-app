# Current work — crxwov

participant: crxwov
agent: Codex
status: completed
updated_at_utc: 2026-11-17T10:51:58Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main (coordination only)

## Objective / Result
Reduce Notka playback and playlist loading delays across public, VPN and direct network routes. The verified backend cache-scan bottleneck is fixed on production.

## Scope
- Production music_resolver/api/routes.py, limited to _is_track_cached and its file-list lookup.
- Preserve the current AUDIO_CACHE_MAX_MB behavior and all cached/user data.
- No client, API contract or canonical runtime source changes. The backend is absent from https://github.com/crxwov/notka-app.

## Validation
- Production before source hash: ecef14d029c7e174a241c4c4a76d879ff7b8a94e00c2ddde67ff5c6f75d6d142 at revision 283f4a9. Patch output hash: 27f10d21dd5280d216904b98ba59862514eb1dde2a06f73e539542fc6e432f77.
- Regression check passed for direct and matched cached tracks, file additions/removals, and one directory enumeration across 100 misses. Candidate compiled and an exact zero-fuzz patch replay matched the production candidate.
- On actual production data, the read-only playlist scan finished in 0.62 s for 6822 tracks, with 6762 cached and one scan of the audio directory.
- Deployed with exact hash checks, source backup and automatic rollback on failed health or media smoke. Backup: /opt/notka/hotfix-backups/cache-scan-index-05zzaGNs.
- Service active after restart. Startup preloader logged 6762/6822 cached. The audio volume retained 7060 files. Cached prepare returned in 18 ms, Range playback returned HTTP 206 with 524288 bytes, and cover retrieval returned HTTP 200.
- Public health, app, cover, prepare and cached media passed with verified TLS on both VPN and direct Ethernet. The same cached range took 0.85 s on VPN and 0.49 s directly.
- At 10:48 UTC, two minutes after rollout, no slow starts appeared during the prior 30 minutes. The two most recent earlier reports were hidden-page starts with server time 0 and cold=false. Their client-side delay remains unlocated. A fresh Android app check was blocked when the device-launch command was rejected by the tool. Telegram playback remains unverified.

## Follow-up
- Carry this production-only backend change into the next designated backend release.
- If a 10+ second start recurs, record the client, VPN state and foreground state so its timing can be matched with server telemetry.