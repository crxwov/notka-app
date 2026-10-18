# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T12:06:10Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Complete the Notka bot's one-message main menu, user profile, Plus-term configurator stub and Back navigation, then generate and attach Notka-style menu banners as the final implementation stage.
- Plain `/start`: one editable message; blue `Открыть Нотку` button first; support and profile share the next row.
- Keep the persistent `Нотка` chat menu button.
- Profile shows current Plus status and aggregate listening time from the user's synchronized devices.
- Plus term can increase/decrease; the payment step shows `plat_check` and never grants Plus.

## Scope / Reservation
`bot/main.py`, `requirements.txt`, focused `tests/test_bot_menu.py`, and new menu banner files under `bot/assets/`. In-chat menu and profile routes only. No channel/promo-video artwork and no changes to `music_resolver/services/proxy_guard.py`.

## Stages
1. Refresh coordination, inspect current bot paths, and verify Telegram button/menu API — completed.
2. Implement main menu, profile, Plus-term stub, and editable Back navigation — in progress.
3. Run focused checks and review the scoped diff — pending.
4. Generate and attach the new in-chat menu banners — pending; deliberately last.
5. Reconcile to reviewed `main` and deploy to `notka` only after drift/health checks permit it — pending.

## Findings / Decisions
- `bot/main.py` already calls `set_chat_menu_button(MenuButtonWebApp(...))` globally; preserve it.
- Plain `/start` currently sends a second explanatory message; remove it. Keep promo and shared-track deep-link behavior.
- Telegram Bot API supports inline-button style `primary` (blue) and MenuButtonWebApp. aiogram added the style field in 3.25.0; current local runtime is 3.31.0, so align the minimum dependency version.
- `sync_store.load(user_id)` stores per-device listen totals; `plus_store.status(user_id)` is the Plus authority.
- User explicitly assigned new in-chat Notka menu banners as the last stage. Fresh `origin/main` says leksik paused separate bot/channel banner and promo-video work until 2026-10-19; do not edit those assets or scope.
- Fresh `origin/main` also had an active ProxyGuard task record from 2026-10-15, older than the 180-second heartbeat. This is a separate source area; leave it unmodified and carry its unverified status forward.

## Validation / Blockers
- No implementation checks run yet.
- Graph discovery tools unavailable; targeted source search/read used instead.
- Deployment must follow `deploy/push.sh` from reviewed `main`; do not deploy the whole `tg-app` branch or bypass its drift guard.

## Next Action / Resume
Publish this reservation using `deploy/publish-work-state.ps1 -Participant crxwov`; implement the callback-driven menu in `bot/main.py`.