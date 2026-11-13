# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-13T22:18:21Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Uncached tracks start from the first available bytes while the server completes and retains the audio cache. Disable the 40 GB eviction limit for this server without treating partial downloads as cache hits. Keep client/server compatibility and verify focused tests plus the running service.

## Scope / Reservation
Canonical repository: `https://github.com/crxwov/notka-app`. Track the server-only change as an applyable patch because current `origin/main` contains client sources but no backend or deployment tree. Patch scope: `music_resolver/api/routes.py`, `miniapp/app.js`, `miniapp/index.html`, and the existing live-stream test. Apply the reviewed patch to `ssh notka`, set `STREAM_LIVE=1` and unlimited audio cache, restart `notka.service`, then verify.

## Stages
1. Refresh canonical coordination and inspect the server's live/cache paths — completed; user confirmed this continues crxwov's WIP.
2. Add and review a tracked server patch; enable first-track live playback and unlimited cache — active.
3. Run the isolated live-stream test and patch checks — pending.
4. Deploy to `ssh notka`, verify service and cache behavior, record results — pending.

## Findings / Decisions
- Live-stream plumbing and tokenized range support already exist on the server; `STREAM_LIVE` is unset and `AUDIO_CACHE_MAX_MB=40000`.
- The miniapp only enables live mode after a prior `/prepare` response; the first cold track therefore misses it.
- `origin/main` has no `todo.md`, either participant work file, or `docs/operations/collaboration.md`; the legacy server work record is old and completed. The user's direct instruction authorizes this task scope.
- Preserve completed `.bin` files; do not change image/cover cache limits. Expired raw live copies and stale partial downloads retain existing cleanup.

## Validation / Blockers
- Fresh canonical origin/main fetched; clean client worktree; no active other-participant reservation exists in fresh main.
- Server `notka.service` is running as `notka`; audio cache is 40 GB on a 97 GB filesystem.
- Relevant isolated test: `/opt/notka/app/tests/live_stream_test.py` uses temporary data/cache and checks it does not write to production cache.
- No source modifications or deployment yet.

## Next Action / Resume
Create the patch on `tg-app`, validate it against the live server tree, then test and deploy.
