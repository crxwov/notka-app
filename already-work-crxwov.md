# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T13:52:51Z
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
- Four candidates generated from existing assets and main-menu reference; all visibly use the unchanged Notka N, title below it, and each page's original palette. Source outputs are in `C:/Users/hackov/.codex/generated_images/01a14ee0-1eed-7cf1-834b-2e0ccce5ac87/` (`exec-beebeceb-8715-42fa-8ff8-6b32360dfdbd.png`, `exec-74806dbb-1736-44f7-b32d-48fe8dba8921.png`, `exec-9c6b0617-a494-48ad-93f7-728d60b8406a.png`, `exec-16518b89-d1d7-4c3e-8513-94c75125f590.png`).

## Next Action / Resume
Generate reviewable images, update greeting and HTML text formatting, test, commit/push only scoped files, deploy and verify.
