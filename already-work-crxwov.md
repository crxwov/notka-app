# Current work — crxwov

participant: crxwov
agent: Antigravity
status: active
updated_at_utc: 2026-10-15T20:51:50Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Fix flapping proxy alerts and premature direct fallback in `ProxyGuard` causing YouTube errors when minor UDP/tunnel jitter occurs:
1. Improve `probe()` to query lightweight `https://www.youtube.com/generate_204` (instead of heavy `music.youtube.com/` HTML), with 7s timeout and immediate retry before failing.
2. Add debounce / hysteresis in `ProxyGuard`: require 2 consecutive failed check cycles before switching to direct mode and alerting the owner.
3. Keep single-cycle recovery: immediately switch back to proxy upon the first successful check.
4. Deploy and verify.

## Scope / Reservation
`music_resolver/services/proxy_guard.py`, `tests/` if applicable.

## Stages
1. Analyze ProxyGuard logs and flapping incident — completed.
2. Update `probe()` with lightweight 204 endpoint and retry — in progress.
3. Add 2-strike debounce in `ProxyGuard` — in progress.
4. Deploy to server and validate.

## Findings / Decisions
- Incident occurred when a 20-second UDP reconnect on Hysteria 2 triggered a single 5-second timeout on heavy `music.youtube.com/`.
- ProxyGuard immediately declared proxy dead, alerted owners via Telegram bot, and switched to direct mode.
- Direct mode in Russia causes Russian ISPs to throttle/block YouTube requests, causing genuine download failures.
- When Hysteria reconnected 20s later, ProxyGuard switched back and alerted again.
- Solution: use lightweight `https://www.youtube.com/generate_204`, retry within `probe()`, and require 2 consecutive failed cycles before switching to direct.

## Validation / Blockers
- Python unit tests / compile check.
- Live probe verification through proxy.

## Next Action / Resume
Apply improvements to `music_resolver/services/proxy_guard.py`.
