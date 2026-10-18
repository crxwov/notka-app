# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T12:07:15Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Finish the bot's one-message main menu, profile and Plus-term stub, then generate Notka-style in-chat menu art as the final stage.
- Plain `/start`: one editable message; blue `Открыть Нотку` first; support and profile on the same next row.
- Keep the persistent `Нотка` chat-menu button.
- Profile shows the user's current Plus state and aggregate listening time from synchronized devices.
- Plus term can increase/decrease; payment stage displays `plat_check` and never grants Plus.

## Scope / Reservation
`bot/main.py`, `requirements.txt`, `tests/test_bot_menu.py`, and new `bot/assets/notka-menu-banner.png`. Interactive menu/profile/Plus routes only. No channel/promo-video art and no edits to `music_resolver/services/proxy_guard.py`.

## Stages
1. Refresh coordination, inspect bot call sites, and verify Telegram API — completed.
2. Implement main menu, profile, Plus-term stub, and editable Back navigation — completed.
3. Run focused checks and review scoped diff — completed (9 tests passed; compile and diff checks passed).
4. Generate and attach the new in-chat menu banner — in progress; deliberately last.
5. Reconcile to reviewed `main` and deploy to `notka` only if authorized and drift/health checks permit — pending.

## Findings / Decisions
- `bot/main.py` already sets `MenuButtonWebApp` globally; preserve it. Plain `/start` now sends one message; old open-app fallback keyboard and promo/shared-track links remain unchanged.
- Telegram Bot API uses `style="primary"` for blue inline buttons. aiogram added `style` in 3.25.0, so the minimum dependency is now 3.25.
- `sync_store.load(user_id)` exposes the user's per-device listen totals; `plus_store.status(user_id)` is the subscription authority. Profile callbacks are private-chat only.
- `plat_check` is a non-mutating placeholder. New banner art is limited to in-chat menu pages; keep leksik's paused channel/promo-video work untouched.
- A stale crxwov record from 2026-10-15 described ProxyGuard work: lightweight `generate_204` retry, two-failure debounce, immediate recovery, tests/live probe. Status remains unconfirmed; this task did not touch it.

## Validation / Blockers
- `venv\Scripts\python.exe -m pytest tests/test_bot_menu.py -q` — 9 passed.
- `venv\Scripts\python.exe -m py_compile bot/main.py tests/test_bot_menu.py` and `git diff --check` — passed.
- Initial test fake signature failure was corrected; no current failure.
- Graph MCP tools unavailable; targeted search/read used.
- Production deploy must use reviewed `main`; do not deploy all of `tg-app` or bypass its branch drift guard.

## Next Action / Resume
Generate `bot/assets/notka-menu-banner.png`, rerun focused checks, then inspect release readiness.