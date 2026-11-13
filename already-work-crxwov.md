# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-13T23:11:11Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
For uncached YouTube Music tracks, start playback from the progressive source while a concurrent background download fills the server audio cache. Remove byte-based audio eviction for this server without breaking cache correctness or partial-file cleanup.

## Scope / Reservation
Canonical repository: `https://github.com/crxwov/notka-app`. Keep backend-only changes as an applyable, reviewed patch because fresh `origin/main` has no backend source. Patch scope: `music_resolver/providers/youtube_common.py`, `music_resolver/providers/youtube_music.py`, `music_resolver/api/routes.py`, and focused server tests. Runtime config: `AUDIO_CACHE_MAX_MB=0`; leave the separate `STREAM_LIVE` feature off. Apply reviewed patch to `ssh notka`, restart `notka.service`, verify.

## Stages
1. Refresh canonical coordination and trace playback/cache paths — completed; user confirmed this is crxwov's WIP.
2. Restore the measured progressive URL proxy and retain concurrent `/prepare` cache fill; add unlimited-cache handling and focused checks — completed.
3. Review and commit the validated patch artifact on `tg-app` — active.
4. Deploy to `ssh notka`, verify service/cache behavior, and record results — pending.

## Findings / Decisions
- Current server has tokenized file-live support, but `.env` leaves it off (comment says ~0.3 s gain); it still waits for yt-dlp extraction and does not fix the reported cold-start delay.
- The Nov 9 direct progressive stream was measured at 1.3–2.4 s for uncached YouTube tracks. Current miniapp already launches `/prepare` and `/stream` together; `/prepare` will keep filling the cache while the progressive `/stream` response plays.
- The direct route will use the local cache on hits and preserve normal errors/behavior for unsupported providers. Keep the `STREAM_LIVE` path off.
- `AUDIO_CACHE_MAX_MB=40000`; define `0` as no byte eviction. Keep stale `.part` and expired raw-live cleanup; do not alter image cache or delete any existing audio.
- `origin/main` lacks backlog/work-state/collaboration files; legacy server records are stale/completed. User explicitly confirmed the WIP and server scope.

## Validation / Blockers
- Isolated copy of the current server: patch dry-run and `live_stream_test.py` passed (0 failures, 140 output lines). Coverage includes cold direct GET, byte ranges, background cache fill, cache hit, unlimited cache, and unchanged real-shaped cache snapshot.
- Production audio cache is 40 GB; filesystem is 97 GB with 36 GB free. Patch is in main at 14b389e; production source/config deployment is pending.
- Backend patch artifact is prepared locally; no production source or runtime config has changed. `.gitattributes` preserves CRLF patch application.

## Next Action / Resume
Review and commit the patch artifact on `tg-app`, then apply it to `ssh notka` and verify service and playback.
