# Current work — crxwov

participant: crxwov
agent: Antigravity
status: active
updated_at_utc: 2026-10-14T18:28:19Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Fix UI issue on desktop where `#import-pill` overlaps with the user greeting ("Привет, hackov") and hero visuals. Relocate the floating import pill on desktop to the bottom-right (above the dock / player bar) with smooth transitions, keeping phone styling intact.

## Scope / Reservation
miniapp/styles.css, miniapp/system.css, miniapp/app.js, miniapp/index.html, android/app/src/main/assets/miniapp/styles.css, android/app/src/main/assets/miniapp/system.css, android/app/src/main/assets/miniapp/app.js, android/app/src/main/assets/miniapp/index.html.

## Stages
1. Add desktop styling for `.import-pill` in `miniapp/styles.css` (bottom-right positioning above player dock, smooth transitions, proper margins) — in_progress.
2. Update click handlers in `miniapp/app.js` so clicking anywhere on the pill body or icon opens the import modal — pending.
3. Bump asset versions in `miniapp/index.html` and synchronize to `android/app/src/main/assets/miniapp/` — pending.
4. Deploy to `notka` server, restart `notka.service`, and verify — pending.
5. Commit and push to `origin/tg-app` — pending.

## Findings / Decisions
- On desktop, `top: 12px; left: 50%` places the 440px wide pill directly over the 40px bold greeting "Привет, hackov" and the glowing 3D hero area.
- Repositioning `body.is-desktop .import-pill` to `bottom: calc(var(--dock, 0px) + var(--sab, 0px) + 20px); right: max(40px, calc((100vw - var(--side, 268px) - 1120px) / 2));` cleanly places it in the bottom-right corner, aligning with the player dock and content bounds without obscuring any headers or hero cards.

## Next Action / Resume
Apply CSS edits and test.
