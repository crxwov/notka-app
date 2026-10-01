---
target: miniapp
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\leksik\\Documents\\Notka\\miniapp\\index.html"
target_fingerprint: "sha256:debaeb773c73525ea87a95146de07b27829b996cde0012aa374a129c00c8e6c8"
target_path: "C:\\Users\\leksik\\Documents\\Notka\\miniapp\\index.html"
timestamp: 2026-09-30T16-57-31Z
slug: miniapp-index-html
---
Method: dual-agent (A: design review · B: detector). Browser visualization skipped: no browser automation tool.

## Design Health Score: 17/40 (Poor)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | No feedback while a track resolves (app.js:1255) |
| 2 | Match System / Real World | 2 | "Топ треков" is really favorites; error text mentions the backend |
| 3 | User Control and Freedom | 1 | No tg.BackButton: Android back/swipe closes the app and stops music; no undo |
| 4 | Consistency and Standards | 2 | Любимое/Избранное/Топ naming drift; ты/вы switching |
| 5 | Error Prevention | 1 | Instant playlist delete; 16px heart inside a play row |
| 6 | Recognition Rather Than Recall | 2 | Track menu only reachable from full player |
| 7 | Flexibility and Efficiency | 1 | 1.1s splash every launch, no recent searches or deep links |
| 8 | Aesthetic and Minimalist Design | 2 | Dead Home tiles, stubs at top level, 6+ infinite animations |
| 9 | Error Recovery | 1 | Search error + "Ничего не нашлось" together; mix stops on a failed track |
| 10 | Help and Documentation | 3 | Onboarding + hint empty states |

## Design Specificity
Authored skin (ember palette, droplet radius motif), generic Spotify skeleton + AI-prototype glass/blobs/grain. Telegram, the core differentiator, has no design expression.
Detector: 42 findings (dark-glow 12, undersized-ui-text 12, bounce-easing 6 FP, layout-transition 3, clipped-overflow 3 (1 real bug: progress thumb clipped styles.css:459/467), low-contrast 2, radial-halo 1, stripes 1, pulsing-dot 1 FP, em-dash 1).

## Priority Issues
- [P0] Not Telegram-native: no BackButton/disableVerticalSwipes/closing confirmation/haptics (app.js:8-19, showScreen app.js:265). Fix: BackButton on subscreens, disableVerticalSwipes, enableClosingConfirmation while playing, HapticFeedback. -> harden
- [P1] Tap-to-play gives no loading feedback; request races; no auto-skip on failure; Мой микс not shuffled; no mediaSession (app.js:1255-1318, 738-760). -> harden
- [P1] False promises: fake "Ссылка скопирована" (app.js:942, 1100), shuffle/repeat no handlers, sleep timer "скоро" after choice, seeded badge "2", Premium benefits imply ads (app.js:1078), "официальный каталог" toast (app.js:1317), About prototype note (index.html:644). -> clarify
- [P1] Destructive actions unguarded: playlist delete (app.js:933), one-tap remove in Edit (app.js:1014). Fix: tg.showConfirm / undo toast. -> harden
- [P2] Accessibility: user-scalable=no (index.html:5), ~16px targets, 5px scrubber, faint text 3.4:1, div/li controls, no aria-live, no prefers-reduced-motion. -> audit, adapt

## Persona Red Flags
Casey: swipe kills music; 16px heart mis-taps; no lock-screen controls; toast overflow at 360px.
Jordan: splash + 3 onboarding cards -> Home where 3 of the first 4 taps refuse; Все == Треки; ♡ vs ＋ unexplained.
Sam: zoom off, unfocusable rows/chips, outline:none, unlabeled switches.
Лёша (friend-link user): no start_param deep link, fake share, localStorage-only library, dead tunnel URL with no error screen.

## Minor Observations
Heavy backdrop-filter over animated blobs and feTurbulence grain; duplicate new-playlist entry points; initial pause icon; Мой микс restarts on tap; track sheet has no Cancel; inline styles bypass tokens; emoji in empty states.

## Questions to Consider
1. Why isn't the chat itself part of the core loop?
2. Should Home be search + recent until the picks work?
3. What if the droplet alone carried the brand, without glass, blobs and grain?
