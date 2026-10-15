# Current work — crxwov

participant: crxwov
agent: Antigravity
status: completed
updated_at_utc: 2026-10-15T12:20:30Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Investigate and resolve urgent track loading failure/incident ("треки грузят пиздец долго почти не грузят").
Success criteria:
1. Root cause identified and confirmed.
2. Production server configuration and routing restored.
3. Track preparation (`/prepare`), streaming (`/stream`), search, and Telegram bot verified working with low latency.
4. Auto-fallback to local sing-box proxy implemented in code so dead `.env` proxy can never break track loading again.

## Scope / Reservation
Server diagnostics and configuration on `notka` (`5.227.61.107:6767`), `music_resolver/config.py`, `run_server.py`, `todo.md`.

## Stages
1. Check server health, logs, systemd services (`notka`, `sing-box`, `caddy`), network connectivity, tunnel latency via SSH — completed.
2. Identify root causes: missing sing-box auto_route rules + stale dead port 40001 in `.env` causing direct unproxied connections to throttled/blocked YouTube endpoints — completed.
3. Apply server and code fixes:
   - Restart `sing-box` to re-establish TUN table 2022 and routing rules (restored Telegram bot & system TUN traffic) — completed.
   - Update `.env` on server from dead port 40001 to active sing-box mixed proxy (`127.0.0.1:1080`) — completed.
   - In `music_resolver/config.py`: add automatic fallback to `http://127.0.0.1:1080` if configured proxy is missing or unresponsive — completed.
   - In `run_server.py`: update watchdog proxy restart to restart `sing-box` (with fallback to `warp-proxy`), configure sudoers for user `notka` — completed.
4. End-to-end verification and testing of track download speed and streaming — completed.

## Findings / Decisions
- Root causes:
  1. `sing-box` policy routing rules (`table 2022`, rules 9000, 9001, 9003) had dropped on the VM, leaving only an unresolved rule 9002. This caused all system-level TUN routed outbound connections (Telegram Bot API, YouTube, SoundCloud) to stall or time out.
  2. `/opt/notka/app/.env` was configured with `YTDLP_PROXY=http://127.0.0.1:40001` and `YTMUSIC_PROXY=http://127.0.0.1:40001`. Since nothing listens on 40001, `_usable_proxy` disabled proxying and reverted to direct connections from the host IP `5.227.61.107`.
  3. Direct connection to YouTube from Russian host IPs is blocked/throttled by ISPs, causing 15-30s read timeouts on all `/prepare` calls and preloader tasks.
  4. Watchdog in `run_server.py` was attempting to restart nonexistent `warp-proxy` service without permissions.
- Decisions:
  - System restored via `sudo systemctl restart sing-box`.
  - Server `.env` updated to `http://127.0.0.1:1080`.
  - Added code fallback in `_usable_proxy` to automatically use `http://127.0.0.1:1080` whenever available.
  - Sudoers rule added on server (`/etc/sudoers.d/notka-services`) allowing `notka` user to restart `sing-box`.
  - OPS-03 resolved and removed from `todo.md`.

## Validation / Blockers
- Direct `curl` to `https://www.youtube.com` through sing-box TUN: HTTP 200 in <0.5s.
- `yt-dlp` stream extraction via `127.0.0.1:1080`: 4.0s (was timing out indefinitely).
- Live server test on `/prepare?source=itunes&id=1433828082`: completed in 3.1s (fresh uncached track).
- Live server test on `/prepare?source=youtube_music&id=XFkzRNyygfk`: completed in 2.37s.
- Live `/stream` audio playback check: HTTP 200 with Range headers, full 7.2MB / 3.8MB audio files served.
- Public URL `https://notka.duckdns.org/stream?...` tested: HTTP 200 OK via Caddy/nginx edge.
- Python syntax check: `py_compile run_server.py`, `py_compile music_resolver/config.py` passed with 0 errors.

## Next Action / Resume
Task completed, tested and deployed to production.
