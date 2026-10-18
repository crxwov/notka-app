# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T12:36:53Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Create a coordinated set of panoramic Notka bot banners for main menu, profile, Notka Plus, and Info. The owner rejected the first titled drafts: left-aligned plain text and near-identical orb placement. Revise with section titles integrated beneath/in the orb's light and visibly varied light placement/glow.
- Four distinct, readable 3:1 drafts shown in chat for review.
- Keep the same “Живой свет” identity; title treatment is refined, luminous, exact Russian text, not plain white text floating on dark.
- Shift orb position, size, and glow character by page while retaining one light source per banner.
- No shipped image or runtime change until owner approval.

## Scope / Reservation
Current work is preview-only image generation for four bot message/page headers. Do not modify `bot/assets`, bot text, runtime, integration, or production. After banner review, continue requested bot copy formatting and Profile > Info with privacy policy and user agreement. No channel banners or promo video.

## Stages
1. Fresh coordination, read private Roadmap, and inspect feedback/base direction — completed. User chose option 2, then rejected left-aligned titles and insufficient orb variation. leksik's broad banner/channel/video work remains paused until 2026-10-19; current scope is only the bot's in-chat pages.
2. Generate and inspect four revised 3:1 banners with integrated luminous headings and moved light — active.
3. Owner visual review — pending; no code or image replacement before review.
4. Format bot text and implement Profile > Info legal content — pending review; locate the existing approved legal source before edits.

## Findings / Decisions
- Visual base: selected option 2, warm-to-magenta-to-violet living-light orb on near-black violet, from the supplied Notka design system.
- Titles: `Главное меню`, `Профиль`, `Нотка Плюс`, `Информация`; neutral white Onest-like letters should be subtly backlit/reflected by the orb and placed below its mark, integrated into the glow.
- Make motion apparent across static pages by changing orb position, size, and intensity/tone between banners; no video or extra colored elements.

## Validation / Blockers
- Fresh remote work records and todo checked; no conflicting current code task. Existing dirty menu code/assets remain untouched.
- No blocker before generation; owner review is required after.

## Next Action / Resume
Generate four individual revised banners, check title spelling/readability and distinct light placements, show the set, and stop for review.