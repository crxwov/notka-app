# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T12:26:22Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Prepare three substantially wider Notka-style bot-message banner drafts for the owner to review before replacing the current art. Continue the already requested bot copy formatting and Profile > Info pages for privacy policy and user agreement after the banner direction is reviewed.
- Three separate wide images match the Mini App's plum, rose, glass-light identity and fit Telegram message banners.
- Show the draft images in chat; leave shipped assets and runtime untouched until the owner selects a direction.

## Scope / Reservation
Current stage: visual draft generation and review only; no runtime changes, asset replacement, commit, integration, or deployment. Follow-up scope after review: bot message formatting and a Profile > Info screen with the existing privacy policy and user agreement content, then validation and the previously authorized release flow. No channel banners or promo video.

## Stages
1. Refresh `origin/main` coordination, inspect Notka brand references and existing bot art — completed. `origin/main` has no unfinished bot banner/Info item; leksik's broader banner/channel promo work is paused until 2026-10-19. This current request is scoped to the bot's in-chat menu banners.
2. Generate and inspect three wide, independent banner drafts; present them for owner review — active.
3. Wait for selected/refined banner direction before replacing production art or continuing code changes — pending.
4. Implement requested message copy formatting and Profile > Info legal content after visual review — pending.

## Findings / Decisions
- Brand references: `DESIGN.md`, `miniapp/index.html`, Mini App screenshot, splash/logo screenshot, and bot profile screenshot.
- Brand tokens: ground `#0C0A12`, warm/core light, rose `#E23C8C`, deep violet `#6D34E0`, translucent glass, Onest.
- Existing Telegram profile screenshot shows the previous generic record/landscape banner that the owner rejected; new images must be wider and use Notka's actual abstract logo/light identity.
- The user's explicit assignment separates bot in-chat drafts from leksik's paused channel and promo-video work.

## Validation / Blockers
- Inspected the supplied screenshots and current shipped menu/profile art. Graph MCP is unavailable; visual and repo context were read directly.
- No code or production file has been changed in this stage.
- No blocker.

## Next Action / Resume
Generate the three separate banner candidates and show the resulting images in chat. Stop for the owner's visual choice before implementation.