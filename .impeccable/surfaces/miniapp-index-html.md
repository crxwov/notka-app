---
version: 1
slug: "miniapp-index-html"
primary_target: "miniapp/index.html"
related_targets: ["miniapp/styles.css","miniapp/app.js"]
---

# Surface: Нотка mini-app (all screens)

Mode: Operate. Telegram Mini App music player; the user finds a track and plays it within seconds, then returns to their own picks.
Scope: full visual redesign (replacement world) plus approved structure simplification and behavior fixes (Telegram BackButton / swipes / haptics, track loading state, auto-skip of unavailable tracks, mediaSession).
User pins: dark by default (light theme later via a toggle); Apple-style liquid glass that is soft, bright and cozy; orange blended with violet; Yandex Music / Apple feel; few buttons, intuitive. Logo mark to be reimagined in the spirit of a note or drop.
Approved structure: 3 tabs (Главная / Поиск / Моё) with profile behind an avatar; search field on Home; no stub tiles on Home; one "…" per track row (long-press opens the same menu); player shows scrubber, prev/play/next, heart, queue, "…"; sleep timer and cast live in "…", shuffle and repeat in the queue header; one onboarding screen shown on first run only; a short splash (light gathers, mark appears, ~1.5s) on every launch — user request 2026-09-30. The light animates constantly (hue flow, drifting lobes and rims), deeper while playing, and keeps running even when the OS asks for reduced motion — user request 2026-09-30.

## Direction contract
THESIS: The music is a living light source. One soft orb of orange, magenta and violet light breathes in the dark while a track plays, and it takes its hue from that track. This refuses the category default of a black grid of covers with a single flat accent color scattered across the chrome.
OWN-WORLD: A near-black violet ground (#0C0A12). The only color is emitted light: orb gradients running from a cream core through orange and magenta to violet. The UI stays neutral, with white and lavender-grey text and one white pill for the primary action. Liquid glass appears only where it sits over the light (tab bar, mini-player, player controls): clear, with a bright specular rim, never a grey film. Type is Onest throughout, set large and tight, with tabular digits. The logo is a note whose head is the glowing orb.
STORY: The user opens Нотка from a chat, sees the light and one search field, types, taps a row, and the orb wakes up in the track's color. They understand the app in one glance: search, play, and their own music under «Моё».
FIRST VIEWPORT: The orb fills the top 45% of Home and breathes when music plays. Below it sit the brand mark with the avatar at the top right, a large greeting, and a full-width search pill as the primary action. Under that are the «Мой микс» row and the favorites. The glass mini-player and tab bar float at the bottom over the light's spill.
FORM: «Живой свет» (lava lamp / night light), rank 1 on the grounded list; chosen as IMPECCABLE'S PICK over the dealt «Вечерний горизонт»; seed key 016e80ca. Kept raises: one primary action per screen; gold/cream core reserved for now-playing; strict row grid of title / artist / time; tabular digits; covers at one registered scale.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
