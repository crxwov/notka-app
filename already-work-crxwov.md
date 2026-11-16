# Current work — crxwov

participant: crxwov
agent: Codex
status: completed
updated_at_utc: 2026-11-16T20:00:36Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main (coordination only)

## Objective
Restore public media throughput and stop accidental audio-cache eviction. crxwov approved both production changes in chat.

## Scope
- Production `music_resolver/api/routes.py`, only `_prune_cache` zero-budget behavior, on the verified f744cd4 server baseline.
- DuckDNS A record for `notka.duckdns.org`, moving from the slow public ingress to the verified alternate ingress.
- No runtime Git integration or client package release. The canonical repo is crxwov/notka-app.

## State
- Before changes: cached 512 KiB took 8.49 s via current DNS, 1.07 s via alternate, 6 ms via origin. Confirmed valid TLS, application, cover and Range through alternate.
- Cache regression reproduced on the production source and passed with the one-line patch. Positive budgets and partial cleanup passed.
- The canonical remote has no leksik record or shared backlog. crxwov's former Android work is completed. Missing coordination context was disclosed before approval.
- Backend patch deployed and checksum confirmed; service healthy, cached prepare 0 ms, Range 206 with 524288 bytes. Backup: loading-latency-sYTOP49P.
- DuckDNS A changed to 5.227.61.107 and three public resolvers agree. Normal hostname: cached range 0.90 s, page 0.33 s and cover 0.17 s, valid TLS.
- Public cold prepare 1.99 s and first 128 KiB 1.06 s; seek returned the correct 206 range. The cold track was cached in the background. 54 files older than 21 minutes remained after new cache writes.
- Android 2.5.5 physical WebView: search, visible cover and advancing playback passed. Telegram Bot API confirmed the app entry point; the device command to open Telegram was rejected by tool policy, so Telegram playback remains unverified.
- Final checks: service active, expected patched checksum, no prune errors or tracebacks in the final sample, correct hostname and TLS, cached 512 KiB repeated in 0.80 s, admin still returns 401.
- Future releases must carry forward this cache fix; rollback source and previous DNS address are stored in the incident notes.
