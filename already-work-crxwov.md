# Current work — crxwov

participant: crxwov
agent: Antigravity
status: active
updated_at_utc: 2026-10-15T16:17:54Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Investigate and resolve server outage / bot failure incident ("срочно изучи инцедент почему то сервер лег бот не работает").
Success criteria:
1. Identify why the server / bot went down via SSH diagnostics on `notka`.
2. Fix root cause, restore service and bot functionality.
3. Validate bot polling, API health, system stability.

## Scope / Reservation
Server diagnostics and operations on `notka` (`5.227.61.107:6767`).

## Stages
1. SSH connection and service health audit (`notka`, `caddy`, `sing-box`, journalctl, dmesg, system resources) — in progress.
2. Root cause determination.
3. Remediation and restart.
4. Acceptance checks (bot response, API endpoints, logs).

## Findings / Decisions
- Incident reported by crxwov: server is down / bot not working.

## Validation / Blockers
- None yet.

## Next Action / Resume
Inspect server state via SSH (`ssh notka`).
