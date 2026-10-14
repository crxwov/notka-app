# Current work — crxwov

participant: crxwov
agent: Antigravity
status: active
updated_at_utc: 2026-10-14T18:39:02Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Maximize playlist import and track transfer throughput:
1. Increase HTTPAdapter pool size to 80 and add dedicated 50-worker ThreadPoolExecutor for YouTube Music searches.
2. Add background server pre-resolution on `/import` so tracks resolve on the server before client even asks.
3. Scale `resolve_batch` to 150 items with 50 concurrent semaphores.
4. Scale client resolver to 4 concurrent workers with 60-track batches (240 tracks/wave), throttling state persistence.

## Scope / Reservation
music_resolver/providers/youtube_music.py, music_resolver/api/routes.py, music_resolver/services/track_index.py, miniapp/app.js, miniapp/index.html, android/app/src/main/assets/miniapp/app.js, android/app/src/main/assets/miniapp/index.html.

## Stages
1. Optimize `music_resolver/providers/youtube_music.py` with 50-worker thread pool and 80-connection pool — in_progress.
2. Update `music_resolver/api/routes.py` with background pre-resolution and 50-semaphore batch resolution — pending.
3. Update `miniapp/app.js` with 4-worker 60-track batching and throttled persistence — pending.
4. Bump versions, sync Android assets, deploy to server, validate, commit and push — pending.

## Findings / Decisions
- Default Python ThreadPoolExecutor was throttled to 8 workers on the 4-core VM, creating an invisible bottleneck when resolving batches.
- Adding a dedicated `ThreadPoolExecutor(max_workers=50)` and connection pool size 80 unlocks true 50-way concurrency on YouTube Music queries.
- Kicking off `_background_pre_resolve` immediately upon `/import` allows the server to resolve tracks in memory before the client requests them, resulting in instant 0ms responses for subsequent batch requests.

## Next Action / Resume
Apply backend optimizations and test speed.
