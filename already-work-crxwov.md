# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T13:49:26Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main

## Objective / Success Criteria
Refine the deployed Notka bot menus: minimal personalized greeting, readable Telegram formatting, and less panoramic matching banners; validate and redeploy to `ssh notka`.
- Every return to the home page greets the user by username (fallback to first name) and asks them to open Notka.
- Product menu copy uses safe Telegram HTML formatting; profile/Plus/info/legal pages remain navigable by editing one message.
- Replace all four banners with a compact 16:9 composition in the existing palette, with the title centered under the unchanged Notka mark.
- Validate tests and image dimensions, integrate only task files into fresh main, deploy and verify health.

## Scope / Reservation
Scope: `bot/main.py`, the four `bot/assets/notka-*-banner.png` images, `tests/test_bot_menu.py`, bot documentation, reviewed main integration, and deployment to `ssh notka`. Preserve the unrelated dirty tg-app checkout. No channel, Android, or promo-video work.

## Stages
1. Refresh coordination and inspect current bot flow/assets — completed; no competing active task.
2. Generate and inspect compact same-palette banners; update minimal formatted bot copy — active.
3. Test, integrate only this task onto fresh main, deploy to `ssh notka`, and verify — pending.

## Findings / Decisions
- Latest origin/main is `dc74e4c`; leksik is paused, crxwov's prior task is completed, todo has no bot-menu task.
- Reuse the four existing banners as edit targets and the attached main banner as the composition reference. Preserve each target's color palette and mark; compact to 16:9 with the title below the mark.
- Use Telegram HTML only in product menu text; HTML-escape user-controlled greeting names. Unknown usernames fall back to the first name.
- Keep prior support, Plus placeholder, legal, and navigation behavior intact.

## Validation / Blockers
- Fresh origin/main coordination checked and main integration worktree fast-forwarded to `dc74e4c`.
- Root tg-app contains unrelated dirty copies of bot code/assets/tests; they are being preserved; edit only clean main integration worktree.
- Existing images are 2172x724 with centered title-under-logo treatment and distinct glow palettes.

## Next Action / Resume
Generate reviewable images, update greeting and HTML text formatting, test, commit/push only scoped files, deploy and verify.
