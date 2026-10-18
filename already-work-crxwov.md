# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-18T12:43:28Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Revise the four Notka bot banners again per owner feedback: make the N logo larger and crisper, generate at the highest available native detail, strongly vary glow character across pages, and shift each orb slightly. Keep the exact section titles under the light.
- Four distinct 3:1 drafts: main menu, profile, Notka Plus, Info.
- Logo is clearly prominent with clean edges; titles stay exact and readable.
- Warm, magenta, violet, intensity, and halo shape change more noticeably by screen; position changes stay slight.
- No shipped image or runtime change until owner approves.

## Scope / Reservation
Current work is preview-only regeneration of the four bot message/page headers. Do not modify `bot/assets`, bot text/runtime, integration, or production. After image review, continue requested bot copy formatting and Profile > Info privacy policy/user agreement work. No channel banners or promo video.

## Stages
1. Refresh coordination, read Roadmap, inspect previous drafts and latest feedback — completed. Owner wants larger/higher-quality logo, more radical per-page glow differences, and small position shifts. Existing leksik reservation remains paused; this direct scope is only the bot in-chat pages.
2. Regenerate and inspect four high-detail drafts — active.
3. Owner visual review — pending; no code or image replacement before approval.
4. Format bot text and implement Profile > Info legal content — pending review; find existing approved legal text before editing.

## Findings / Decisions
- Keep selected option 2's living-light look and title-under-mark treatment.
- Logo: use the supplied official split-N reference, larger in the orb core with crisp, well-defined edges.
- Vary halo shape/size, brightness and warm/rose/violet balance substantially across pages, while nudging orb positions a small amount.
- Titles remain: `Главное меню`, `Профиль`, `Нотка Плюс`, `Информация`.

## Validation / Blockers
- Fresh origin coordination and private Roadmap checked; no competing runtime task. Existing dirty menu code/assets preserved.
- No blocker before generation.

## Next Action / Resume
Generate four individual high-detail panoramic banner drafts, check logo prominence and exact Russian text, then show the set for review.