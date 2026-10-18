# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T12:52:21Z
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
1. Refresh coordination, read Roadmap, inspect previous drafts and latest feedback — completed. Existing leksik reservation remains paused; this direct scope is only the bot in-chat pages.
2. Main-menu visual reference review — completed; owner selected the logo/style from `exec-2f7309a2-1725-4150-826b-37f3a1b0b426.png`.
3. Generate remaining three banners — completed; user approved the selected logo/style and requested the remaining work.
4. Inspect existing bot work and legal text; implement menu/profile/info flows — active.
5. Validate, integrate to main, deploy to `ssh notka`, and verify health — pending.

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
- Fresh origin coordination and private Roadmap checked; no competing runtime task. Existing dirty menu code/assets preserved.
- Three remaining 3:1 drafts generated at 2172x724 and displayed inline; user approved their style and authorized bot integration/deployment.
- Prior dirty app changes and assets must be reviewed and preserved; do not assume they are disposable.

## Next Action / Resume
Inspect source graph (or targeted fallback), dirty diffs, legal text, and deployment procedure. Implement smallest complete bot flow, validate it, integrate reviewed runtime changes to main, and deploy/verify the server.
