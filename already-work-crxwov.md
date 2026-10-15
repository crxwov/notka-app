# Current work — crxwov

participant: crxwov
agent: Antigravity
status: active
updated_at_utc: 2026-10-15T11:47:26Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Investigate and resolve incident: tracks loading very slowly or not loading at all ("треки грузят пиздец долго почти не грузят").
Success criteria:
1. Identify exact root cause via SSH diagnostics on `notka` (logs, sing-box, Hysteria 2 tunnel, yt-dlp, proxy/network, disk/cache, CPU/memory, DNS).
2. Fix the underlying bottleneck/failure.
3. Validate track streaming / `/prepare` / `/stream` latency and success end-to-end.

## Scope / Reservation
Server diagnostics and configuration on `notka` (`5.227.61.107:6767`), `music_resolver/` if backend fix is required.

## Stages
1. Check server health, logs, systemd services (`notka`, `sing-box`, `caddy`), network connectivity, tunnel latency via SSH — in progress.
2. Diagnose yt-dlp / YouTube Music download speed, Hysteria 2 connection to `de.deytt.space:8443`, DNS resolution.
3. Formulate and apply fix.
4. Verify track download and streaming latency.

## Findings / Decisions
- Incident reported by user: tracks loading extremely slowly or stalling.
- Beginning server inspection via SSH (`ssh notka`).

## Validation / Blockers
- None yet.

## Next Action / Resume
Connect via SSH to `notka`, check `journalctl -u notka.service`, check `sing-box` status, measure download speed for audio.
