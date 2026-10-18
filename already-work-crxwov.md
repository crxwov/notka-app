# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T12:18:13Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Finish the bot's one-message main menu, profile and Plus-term stub; generate Notka-style in-chat menu art; integrate the scoped changes into fresh `main` and deploy to `notka`.
- Plain `/start`: one editable message; blue `Открыть Нотку` first; support and profile on the same next row.
- Keep the persistent `Нотка` chat-menu button.
- Profile shows the user's current Plus state and aggregate listening time from synchronized devices.
- Plus term can increase/decrease; payment stage displays `plat_check` and never grants Plus.

## Scope / Reservation
`bot/main.py`, `requirements.txt`, `tests/test_bot_menu.py`, and new `bot/assets/notka-{menu,profile,plus}-banner.png`. Interactive menu/profile/Plus routes only. Support: `https://t.me/notka_support`. No channel/promo-video art and no edits to `music_resolver/services/proxy_guard.py`.

## Stages
1. Refresh coordination, inspect bot call sites, and verify Telegram API — completed.
2. Implement main menu, profile, Plus-term stub, and editable Back navigation — completed.
3. Run focused checks and review scoped diff — completed (10 tests passed; compile and diff checks passed).
4. Generate and attach branded menu/profile/Plus banners — completed; three assets are in `bot/assets/`.
5. Integrate scoped bot changes on fresh `main` — completed as `c639bfb`; deploy to `notka` — in progress under explicit user authorization.

## Findings / Decisions
- `bot/main.py` already sets `MenuButtonWebApp` globally; preserve it. Plain `/start` now sends one message; old open-app fallback keyboard and promo/shared-track links remain unchanged.
- Telegram Bot API uses `style="primary"` for blue inline buttons. aiogram added `style` in 3.25.0, so the minimum dependency is now 3.25.
- `sync_store.load(user_id)` exposes the user's per-device listen totals; `plus_store.status(user_id)` is the subscription authority. Profile callbacks are private-chat only.
- `plat_check` is a non-mutating placeholder. New banner art is limited to in-chat menu pages; keep leksik's paused channel/promo-video work untouched.
- User corrected the support URL to `https://t.me/notka_support`; the menu and focused assertion now use it.
- Production currently records `branch=tg-app`, commit `0adb4e1`; switching this requested release to `main` requires the deploy script's explicit `NOTKA_FORCE=1` branch override. The user explicitly authorized deploying `main` after integration.
- Clean `main` release commit `c639bfb` contains only the scoped bot menu/profile, dependency floor, focused test, and three banner assets.
- A stale crxwov record from 2026-10-15 described ProxyGuard work: lightweight `generate_204` retry, two-failure debounce, immediate recovery, tests/live probe. Status remains unconfirmed; this task did not touch it.

## Validation / Blockers
- `venv\Scripts\python.exe -m pytest tests/test_bot_menu.py -q` — 10 passed; Python compilation and `git diff --check` passed after support correction.
- Re-ran all 10 focused tests, Python compilation, and diff checks from the clean main integration checkout before commit; push of `c639bfb` succeeded.
- Read-only production checks: `/health` returned `{"status":"ok"}`; `DEPLOY_INFO` was `branch=tg-app`, `commit=0adb4e1`; `/opt/notka/app/backups` exists.
- Initial test fake signature failure was corrected; no current failure.
- Graph MCP tools unavailable; targeted search/read used.
- Production deploy must use the reviewed `main` commit; do not deploy all of `tg-app`. The explicit branch switch is limited to the user's requested release.

## Next Action / Resume
Deploy the exact reviewed `main` release with the user-authorized branch switch, then verify DEPLOY_INFO, service status, and `/health`; publish the completed work state.
