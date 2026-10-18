# Current work — crxwov

participant: crxwov
agent: Codex
status: completed
updated_at_utc: 2026-10-18T13:05:37Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Finish the authorized Notka Telegram bot menu/profile flow, place the approved banner set into the bot, and deploy to the named server.
- `/start` edits one persistent menu message with Open Notka, support, and profile actions; Open Notka uses the requested blue style where supported.
- Profile shows current Plus subscription and listening duration, plus purchase/renewal stub with exact `plat_check` payment placeholder.
- Add Profile > Info with privacy policy and user agreement, back navigation, persistent Notka menu button, and approved banners on bot messages.
- Validate the targeted bot paths and deploy from verified main to `ssh notka`; check service health afterward.

## Scope / Reservation
Scope: bot menu/profile implementation, `bot/assets/`, relevant bot tests, reviewed integration to main, and deployment to `ssh notka`. Preserve unrelated existing dirty changes. No channel banners, Android client work, or promo video.

## Stages
1. Refresh coordination, inspect latest feedback, and isolate bot scope — completed. Existing leksik banner/video work remains separate.
2. Generate and owner-review the four approved wide banners — completed; 2172x724 assets.
3. Implement Info/legal pages, bannered deep links/fallback, and navigation docs/tests — completed.
4. Validate, integrate only this change to fresh main, deploy to `ssh notka`, and verify — completed.

## Findings / Decisions
- Keep selected option 2's living-light look and title-under-mark treatment.
- User selected the N mark as it appears in `exec-2f7309a2-1725-4150-826b-37f3a1b0b426.png`; preserve it exactly in style and scale for other banners.
- Make page glows distinct and nudge each composition slightly, retaining the same overall banner language.
- Profile: `C:/Users/hackov/.codex/generated_images/01a14ee0-1eed-7cf1-834b-2e0ccce5ac87/exec-ce6fe371-7b2e-445e-ac6e-e9a98ff30559.png`.
- Notka Plus: `C:/Users/hackov/.codex/generated_images/01a14ee0-1eed-7cf1-834b-2e0ccce5ac87/exec-c0b339c1-7c1f-4779-8fe2-51f784c66b65.png`.
- Info: `C:/Users/hackov/.codex/generated_images/01a14ee0-1eed-7cf1-834b-2e0ccce5ac87/exec-3740a837-bbba-45c3-9a7f-9d1faf17ad3c.png`.
- Titles remain: `Главное меню`, `Профиль`, `Нотка Плюс`, `Информация`.
- Support handle is `@notka_support`.
- Payment purchase/renewal must remain a stub that displays `plat_check` at the payment step.

## Validation / Blockers
- Fresh origin/main and both coordination records checked; unrelated dirty tg-app changes remain untouched.
- `python -m pytest tests/test_bot_menu.py -q`: 13 passed; `py_compile` and `git diff --check` passed.
- All four banners are 2172x724; privacy and terms captions are 519/531 characters (under Telegram caption limit).
- Server preflight: `notka.service` active, `/health` returns `{"status":"ok"}`, DEPLOY_INFO branch is main; backup data exists.
- Commit `727da518b67e682b719f73f76f5c4295755d8c18` is on origin/main and deployed; DEPLOY_INFO matches, service remains active, and `/health` is OK.

## Next Action / Resume
No further action; production deployment and health verification completed.
