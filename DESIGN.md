---
name: Нотка
description: Music inside Telegram, lit by one living light that takes its hue from the track that is playing.
colors:
  ground: "#0C0A12"
  surface-1: "rgba(236, 228, 255, 0.055)"
  surface-2: "rgba(236, 228, 255, 0.09)"
  surface-sheet: "#17131F"
  surface-toast: "#221C2C"
  line: "rgba(236, 228, 255, 0.09)"
  text: "#F4EFFF"
  text-2: "rgba(244, 239, 255, 0.66)"
  text-3: "rgba(244, 239, 255, 0.52)"
  light-core: "#FFE3B8"
  light-warm: "#FF6A2E"
  light-mid: "#E23C8C"
  light-deep: "#6D34E0"
  now: "#FFCB85"
  liked: "#FF5C93"
  danger: "#FF7A7A"
typography:
  display-xl:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  display:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline-player:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title-sm:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  row-title:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1"
  body:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
    fontFeature: "\"tnum\" 1"
  lede:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  secondary:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
rounded:
  radius-s: "10px"
  cover-md: "12px"
  row: "14px"
  radius-m: "16px"
  playlist-card: "18px"
  group: "20px"
  cover-lg: "22px"
  card: "22px"
  radius-l: "24px"
  sheet: "28px"
  pill: "999px"
  circle: "50%"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  dock-inset: "12px"
  row-gap: "14px"
  md: "16px"
  gutter: "20px"
  lg: "24px"
  block: "28px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ground}"
    typography: "{typography.row-title}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "50px"
  button-primary-onboarding:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ground}"
    rounded: "{rounded.pill}"
    height: "56px"
    width: "100%"
  button-quiet:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "50px"
  button-text:
    textColor: "{colors.text-2}"
    padding: "0 4px"
    height: "44px"
  round-light:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ground}"
    rounded: "{rounded.circle}"
    size: "48px"
  round-light-play:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ground}"
    rounded: "{rounded.circle}"
    size: "84px"
  round-quiet:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.circle}"
    size: "48px"
  round-glass-control:
    textColor: "{colors.text}"
    rounded: "{rounded.circle}"
    size: "64px"
  icon-button:
    textColor: "{colors.text}"
    rounded: "{rounded.circle}"
    size: "44px"
  field-search:
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 8px 0 18px"
    height: "54px"
  modal-input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.row}"
    padding: "0 16px"
    height: "52px"
  chip:
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "38px"
  chip-active:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ground}"
    rounded: "{rounded.pill}"
    height: "38px"
  tag:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  track-row:
    textColor: "{colors.text}"
    typography: "{typography.row-title}"
    rounded: "{rounded.row}"
    padding: "8px 4px 8px 8px"
  track-row-playing:
    textColor: "{colors.now}"
    rounded: "{rounded.row}"
  cover-xs:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.radius-s}"
    size: "44px"
  cover-sm:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.radius-s}"
    size: "48px"
  cover-md:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.cover-md}"
    size: "56px"
  cover-shelf:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.radius-m}"
    size: "150px"
  cover-lg:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.cover-lg}"
    size: "220px"
  mix-row:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.card}"
    padding: "8px 10px 8px 8px"
  group:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.group}"
  group-row:
    typography: "{typography.body}"
    padding: "10px 16px"
    height: "56px"
  tabbar:
    rounded: "{rounded.pill}"
    padding: "6px"
    height: "68px"
  tab:
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
  tab-active:
    backgroundColor: "rgba(255, 255, 255, 0.13)"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
  mini-player:
    rounded: "{rounded.card}"
    padding: "0 10px"
    height: "64px"
  sheet:
    backgroundColor: "{colors.surface-sheet}"
    rounded: "28px 28px 0 0"
    padding: "8px 12px 12px"
  sheet-row:
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.row}"
    padding: "0 10px"
    height: "54px"
  modal:
    backgroundColor: "{colors.surface-sheet}"
    rounded: "{rounded.sheet}"
    padding: "20px 16px 16px"
    width: "380px"
  toast:
    backgroundColor: "{colors.surface-toast}"
    textColor: "{colors.text}"
    rounded: "18px"
    padding: "12px 18px"
  switch:
    backgroundColor: "rgba(236, 228, 255, 0.16)"
    rounded: "{rounded.pill}"
    width: "51px"
    height: "31px"
  switch-on:
    backgroundColor: "{colors.text}"
    rounded: "{rounded.pill}"
    width: "51px"
    height: "31px"
---

# Design System: Нотка

## Overview

**Creative North Star: "Живой свет" (The Living Light)**

Нотка is a dark room with one light source in it, and that light is the music. A soft orb of layered ellipses, cream at the core, then orange, magenta and violet, floats behind every screen. At rest it is still and slightly dimmed. When a track plays it breathes, and over 1.4 seconds it shifts to a hue sampled from that track's artwork. Everything else stays quiet. The chrome is neutral white and lavender-grey on a near-black violet ground, there is one white pill for the primary action, and gold appears only on whatever is playing now.

The light is the only thing on screen allowed to carry color. Each screen places it differently: large and high on Home, low and big behind the onboarding copy, huge behind the Player, smaller and dimmer on Search and «Моё», and pushed up and faint on sub-screens. The bright crescent rims only show where the light is the subject (Home, onboarding, Player). A soft-light grain keeps the dark from banding, and a violet spill pools under the dock so the glass there has light to refract.

Liquid glass is a material you earn by floating over the light. The tab bar, the mini-player and the Player's round controls are clear and bright, with a specular rim and a faint tint of the current hue. Nothing else uses glass. Onest carries all the type: set large and tight at the top of the hierarchy, calm at 16px in rows, with tabular digits everywhere.

**Key Characteristics:**
- One light source behind every screen. Its hue follows the playing track, and it breathes only while music plays.
- Neutral chrome: white, lavender-grey and a single white primary pill per screen.
- Gold (`now`) is reserved for the thing that is playing.
- Liquid glass only on the dock and the Player's round controls.
- Onest throughout, with tight negative tracking on headings and tabular numerals.
- Covers at one registered scale. A missing cover shows a small piece of the light.

## Colors

The palette is a near-black violet night lit by warm-to-violet emitted light. The UI itself is colorless.

### Primary
- **Emitted Light, four stops** (`light-core` cream, `light-warm` ember orange, `light-mid` magenta, `light-deep` violet): these are the orb's layers, and they only live inside light. They are runtime custom properties (`--c-core`, `--c-warm`, `--c-mid`, `--c-deep`) registered with `@property` as `<color>`, so they interpolate. At playback `--c-core`, `--c-warm` and `--c-mid` are reset from the artwork hue *h* as `hsl(h 100% 88%)`, `hsl(h 94% 60%)` and `hsl(h+34 82% 56%)`. `--c-deep` stays violet as the anchor. The frontmatter values are the brand defaults shown before any track plays. The same stops tint the glass fill, the loading pulse dots, the dock spill and the focus ring.

### Secondary
- **Now Gold** (`now`): the now-playing marker. It colors the playing row's title, the equalizer bars on its cover, the row spinner arc, the «Мой микс» title while it plays, the mini-player progress line, and the warm end of the scrubber fill.

### Tertiary
- **Heart Pink** (`liked`): only the filled heart when a track is liked.
- **Soft Alarm Red** (`danger`): only destructive rows in sheets (delete, remove).

### Neutral
- **Violet Night** (`ground`): the page ground and the base under the light. The Telegram header and background color are set to the same value.
- **Lifted Veil** (`surface-1`) and **Raised Veil** (`surface-2`): translucent lavender fills. `surface-1` is for pressed rows and grouped lists, `surface-2` for quiet buttons, tags, avatars and empty cover slots.
- **Sheet Plum** (`surface-sheet`): the opaque ground of bottom sheets and modals. **Toast Plum** (`surface-toast`) is one step lighter so toasts separate from sheets.
- **Hairline** (`line`): inset 1px outlines and dividers, always drawn as inset box-shadow and never as border.
- **Moon White** (`text`): primary text, and the fill of the primary pill, the white play discs, the active chip and the switch-on state.
- **Lavender Grey** (`text-2`) for secondary text and idle icons. **Dim Lavender** (`text-3`) for times, indices and placeholders.

### Named Rules
**The Only-Light-Is-Color Rule.** Chrome (text, icons, buttons, fields, borders, chips, tabs) is neutral. Color appears only as emitted light: the orb, the dock spill, glass tint, fallback covers, the «Мой микс» and empty-state orbs, the loading dots and the logo's core. The only exceptions are `now`, `liked` and `danger`, each tied to one meaning.

**The Now-Is-Gold Rule.** `now` marks the currently playing item and nothing else. It is not used for selection, confirmation or emphasis.

**The One-White-Pill Rule.** Each screen has at most one white `button-primary` pill. White round play discs (`round-light`) are the play affordance and do not count as the screen's pill, but they never appear in any other color.

## Typography

**Display Font:** Onest (self-hosted variable, 400–800, Cyrillic and Latin subsets, `font-display: swap`), falling back to system-ui, -apple-system, Segoe UI and sans-serif
**Body Font:** Onest
**Label/Mono Font:** Onest (no second family)

**Character:** A friendly, contemporary grotesque that reads warmly in Russian. The top of the hierarchy is heavy and tightly tracked, and the body is plain and calm.

### Hierarchy
- **Display XL** (800, 40px, 1.04, -0.035em): the onboarding headline only.
- **Display** (700, 34px, 1.08, -0.03em, balanced wrap): the Home greeting and tab-screen titles.
- **Headline** (700, 26px, 1.15, -0.025em): playlist, album and artist hero titles. The Player track title uses 24px at 1.2 on a single ellipsized line. The profile name uses 24px.
- **Title** (700, 20px, -0.02em): section heads and empty-state titles. The 17px/700 variant covers bar titles, the «Мой микс» title and in-results section heads. Sheet titles sit at 19px.
- **Row title** (600, 16px, -0.01em): track, playlist and notification titles, always one ellipsized line.
- **Body** (400, 16px, 1.45): group rows and sheet rows. The lede and onboarding text use 17px at 1.5, capped at 32–34ch.
- **Secondary** (400, 14px): artists, subtitles and times, in `text-2` or `text-3`. Scrubber times and fine print use 13px.
- **Label** (600, 12px): tab labels and tags. Labels are sentence case and never uppercase.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on body, so every duration, index and count aligns. Never turn it off locally.

**The Tight-Top Rule.** Anything 20px or larger is weight 700–800 with negative tracking between -0.02em and -0.035em. Anything 16px or smaller keeps tracking between -0.01em and 0.

## Layout

The app is a single column centered at a maximum width of 560px, with 20px side gutters. Screens are absolutely stacked scroll containers. Top padding is the safe-area inset plus 12px. Bottom padding is the measured dock height (`--dock`, set from JS) plus the safe-area inset plus 24px, so content never ends under the glass. The viewport height comes from Telegram (`--tg-vh`), not `100dvh`.

On Home the light is the subject. An empty stage (`clamp(150px, 27vh, 260px)`) leaves room for the orb under the brand row, followed by the greeting, the full-width search field, the «Мой микс» row and then blocks. Blocks are separated by 28px; the «Мой микс» row takes 32px. Rows use a 14px gap between cover and text. Horizontal shelves bleed to the screen edge (`margin: 0 -20px`) and snap per card.

The dock floats 12px in from each side. The tab bar sits at safe-area + 12px, and the mini-player sits above it at safe-area + 88px, or at safe-area + 14px when there is no tab bar. Sub-screens swap the tab bar for a 48px top bar with the title centered between two 44px controls. Inside Telegram the in-app back button is hidden and the native BackButton handles back.

There are no layout breakpoints. On desktop the 560px column stays centered while the light fills the full window.

## Elevation & Depth

Depth comes from light, not from stacked cards. The orb and spill sit at z-index 0 behind everything. Content surfaces are translucent veils with inset hairlines and cast no shadow. Real shadows appear in two places only: under things that float over the light (glass, the large cover, the play disc) and under overlays (sheets, modals, toasts). Every overlay also has a 1px inset top highlight.

### Shadow Vocabulary
- **Glass float** (`0 12px 32px -8px rgba(4, 2, 10, 0.55)`, plus inset rims `inset 0 1px 0.5px rgba(255,255,255,0.5)`, `inset 0 -1px 1px rgba(255,255,255,0.1)`, `inset 0 0 0 0.5px rgba(255,255,255,0.16)`): the tab bar, mini-player and Player round controls.
- **Hero cover** (`0 24px 48px -16px rgba(0, 0, 0, 0.6)`): 220px covers. The Player artwork uses `0 30px 60px -18px rgba(4, 2, 10, 0.75)`.
- **Play disc** (`0 16px 36px -12px rgba(4, 2, 10, 0.6)`): the Player's 84px play button.
- **Sheet** (`inset 0 1px 0 rgba(255,255,255,0.1), 0 -20px 50px -20px rgba(0,0,0,0.6)`), **Modal** (`… 0 30px 60px -20px rgba(0,0,0,0.7)`), **Toast** (`… 0 16px 40px -12px rgba(0,0,0,0.7)`).
- **Veil outline** (`inset 0 0 0 1px` in `line`): grouped lists, the «Мой микс» row and idle chips.

### Named Rules
**The Glass-Over-Light Rule.** Liquid glass (clear gradient fill tinted by `--c-warm` and `--c-deep`, `backdrop-filter: blur(22px) saturate(190%) brightness(1.08)`, a 1px masked specular rim that is brightest at the top left, and a radial touch bloom at the finger position) is used only on the tab bar, the mini-player and the Player's round controls. It must look clear and bright. A grey film means it is wrong. Where blur is unsupported, it falls back to opaque `rgba(38, 32, 50, 0.92)`.

**The Rims-Where-Light-Leads Rule.** The orb's two crescent rims are visible only on Home, onboarding and Player. Everywhere else they fade to 0 over 0.9s.

## Shapes

The form language is soft and round. Anything you press as an action is either a full pill (999px) or a perfect circle. Content containers use generous rounded rectangles: 14px rows, 20px groups, 22px for the «Мой микс» row and the mini-player, and 28px sheets (top corners only) and modals. Covers follow their own registered steps: 10px at 44 and 48, 12px at 56, 16px at 150, 22px at 220, and 18px for fluid playlist-grid tiles. Artist covers are circles. There are no hard edges or visible borders; outlines are inset hairlines.

The logo mark is a note whose head is the light. It is a 24-unit symbol: a halo circle (r 7.4, orange to magenta to transparent violet), a head circle (r 4.6, radial from `#FFF1DC` through `#FF8A3D` and `#E2408E` to `#7A3BE8`), and a Moon White stem and flag (2.1 stroke, round caps). It appears at 34px beside the wordmark on Home, 56px on onboarding and 72px in About. The gradient is fixed and does not follow the track hue.

## Components

### Buttons
- **Shape:** full pill (999px) or circle (50%).
- **Primary:** Moon White fill with Violet Night text, 50px tall, 24px side padding, 16px/600. It stretches full width in modals and empty states. The onboarding «Начать» is 56px tall at 17px. Press state is `scale(0.97)` with no hover color change.
- **Quiet:** `surface-2` fill with `text` color, same geometry. Used for secondary modal actions.
- **Text button:** `text-2`, 15px/600, 44px minimum height. It turns `text` on press.
- **Round light (play disc):** a white circle holding a Violet Night glyph. Sizes are 44px in the mini-player, 48px on the «Мой микс» row and 84px in the Player. It swaps play and pause icons with `body.is-playing`, and while loading it shows a spinner (dark ring with a `ground` arc).
- **Round quiet:** a 48px `surface-2` circle. `aria-pressed="true"` turns it white.
- **Icon button:** a 44px (or 36px) transparent circle that fills `surface-1` and scales to 0.92 on press.
- **Focus:** `2px solid --c-core` outline with a 3px offset, visible on keyboard focus only.

### Chips
- **Style:** a 38px pill with a 1px inset hairline, `text-2`, 15px/600. The row scrolls horizontally and bleeds to the right edge.
- **State:** the active chip is Moon White with Violet Night text and no outline. Tags are 22px `surface-2` pills with 12px/600 labels.

### Cards / Containers
- **«Мой микс» row:** `surface-1` with an inset hairline and 22px radius. It holds a 56px square orb (`--orb-mini`, 16px radius), a 17px/700 title and a 48px play disc.
- **Grouped list:** `surface-1`, 20px radius, inset hairline. Rows are at least 56px tall with 16px padding and are separated by an inset top hairline.
- **Shelf card:** a 150px cover with a 15px/600 title and a 14px sub-line.
- **Internal padding:** 8–16px. Surfaces carry no shadows.

### Inputs / Fields
- **Search field:** a 54px pill with a white vertical gradient (0.11 to 0.05), `blur(18px) saturate(170%)`, an inset top highlight and an inset hairline. Input text is 17px and the placeholder is `text-3`. On Home it is a button that opens Search. This is the primary action on Home.
- **Focus:** the inset outline changes to 1.5px `rgba(255, 227, 184, 0.55)`, a cream edge taken from the light core.
- **Modal input:** a 52px field with 14px radius and `surface-2` fill, using the same cream inset on focus.

### Navigation
- **Tab bar:** a glass pill, 68px tall, 6px padding, with three equal tabs (Главная / Поиск / Моё). Each tab is a 24px icon over a 12px/600 label in `text-2`. The active tab gets a `rgba(255,255,255,0.13)` pill with an inset top highlight and `text` color. Press scales to 0.96, and selection fires a haptic.
- **Sub-screen bar:** 48px tall, with a centered 17px/700 title between 44px controls.

### Track Row (signature)
- **Grid:** `[index?] 48px cover | title + artist (1fr) | time | one action`, with a 14px column gap and 14px radius. The row fills `surface-1` on press. Title is 16px/600 in `text`, artist 14px in `text-2`, time 14px in `text-3`, and the single trailing action is «…» (or a context action such as add or remove) in `text-2`.
- **Behavior:** a tap plays the track. A long-press (480ms) opens the same menu as «…» and fires a medium haptic.
- **Playing:** the title turns `now`. The cover darkens with a 50% Violet Night scrim and shows three gold equalizer bars that animate only while audio plays.
- **Loading:** the same scrim with a 20px ring spinner whose arc is `now`.

### Covers
- **Registered scale:** 44 (mini-player), 48 (rows and sheet heads), 56 (list rows and «Мой микс»), 150 (shelves), 220 (hero). Fluid square tiles are allowed only in the playlist grid (minimum column 140px). The Player artwork is fluid at `min(78vw, 340px, 40vh)`.
- **Fallback:** a cover with no artwork, or one that fails to load, becomes a piece of the light: `radial-gradient(circle at 34% 30%, cream core 0 8%, hue 36%, hue−30 64%, hsl(262 66% 38%) 100%)`. The hue is picked by hashing the item's name into the brand hue set (14, 24, 34, 336, 348, 6, 318), so neighboring rows differ. The Favorites cover is a fixed pink-to-violet orb with a white heart.

### Mini-player
A 64px glass capsule with 22px radius. It holds a 44px cover, a 15px/600 title over a 13px artist, and a 44px white play disc. A 2px `now` progress line runs along the bottom edge with 18px inset. It enters with `screen-in`.

### Sheets, Modals, Toasts
- **Sheet:** rises from the bottom over a `rgba(6,4,12,0.6)` scrim with 0.42s `ease-out`. It is `surface-sheet` with a 28px top radius, a 40×5 handle, a head showing the 48px cover and track meta, then 54px icon rows (22px icons in `text-2`). The last row is a centered «Отмена» on `surface-1`. Destructive rows use `danger`.
- **Modal:** at most 380px wide, `surface-sheet`, 28px radius. It scales from 0.94 while fading in. Actions sit in a row of equal pills or a vertical stack.
- **Toast:** drops from the top safe area. It is a `surface-toast` block with 18px radius, 15px/500 centered text and 0.45s `ease-out`, and it ignores pointer events.

### Switches
51×31 pill tracks. Off is `rgba(236,228,255,0.16)` with a white 25px knob. On is a Moon White track with a Violet Night knob that slides 20px over 0.3s `ease-out`. The switch never uses color.

### Motion
- **Easing:** `ease-out` `cubic-bezier(0.16, 1, 0.3, 1)` for arrivals and presses. `ease-in-out` `cubic-bezier(0.65, 0, 0.35, 1)` for the light and loops.
- **Hue shift:** the four light properties transition over 1.4s `ease-in-out`, and so do the glass tints. Screen placement of the light moves over 1.1s.
- **Breathing (playing only):** violet 9s, magenta 7s and orange 6s drift and scale loops, with the rims riding on them, and a 3.2s core pulse (scale to 1.16). At rest the core drops to 0.62 opacity and the orange layer to 0.85.
- **Loading pulse:** while a track or search is loading, the core pulse speeds up to 0.9s. The search loading state shows three dots in warm, mid and deep that pulse on a 1.1s loop with 0.15s stagger.
- **Screen-in:** 0.36s fade and 10px rise. The Player uses 0.44s with a 6% rise. At rest the Player artwork shrinks to 0.94.
- **Reduced motion:** all animations collapse to a single 0.01ms run, transitions cap at 0.12s, and the orb stops breathing and pulsing. Spinners keep a slow 1.6s rotation so loading stays legible.

## Do's and Don'ts

### Do:
- **Do** let the light carry all color. Feed it the artwork hue through `--c-core`, `--c-warm` and `--c-mid`, and transition over 1.4s.
- **Do** give every screen its own light placement, and keep the rims to Home, onboarding and Player.
- **Do** keep one white `button-primary` pill per screen and make every play affordance a white disc.
- **Do** keep track rows on the strict grid (cover, title/artist, time, one action), and open the same menu on long-press as on «…».
- **Do** use only registered cover sizes (44/48/56/150/220), and show a piece of the light when artwork is missing.
- **Do** draw outlines and dividers as inset 1px `line` shadows.
- **Do** set every number in tabular figures and every heading of 20px or more with negative tracking.
- **Do** stop all breathing under `prefers-reduced-motion`.

### Don't:
- **Don't** color chrome with the light stops or an accent. Buttons, chips, tabs, icons and switches stay white, lavender-grey or `surface`.
- **Don't** use `now` gold for anything except what is currently playing.
- **Don't** put liquid glass on surfaces that don't float over the light (content cards, grouped lists, sheets, modals), and never let it read as a grey film.
- **Don't** make the orb breathe when nothing is playing.
- **Don't** add a second track-row action, or cover sizes between the registered steps.
- **Don't** give the logo a flat fill or tie its gradient to the track hue. Its head is always the brand light.
- **Don't** set labels in uppercase or add kicker/eyebrow lines above headings.

<!-- preserved-brand-asset-rules:start -->
# 3D-иконки Нотки (Blender)

Эталон стиля: `3D иконки/reference-final.blend` и `reference-final.png` (карта с монетами на подиуме). Эталон **не менять**. Все новые иконки должны выглядеть как часть этого набора.

## Файлы системы (папка `3D иконки/`)
| Файл | Что внутри |
|---|---|
| `reference-final.blend/.png` | утверждённая сцена, только для сравнения |
| `materials.blend` | 25 материалов `mat_*`, помечены как ассеты (Asset Browser, тег `notka`) |
| `rig.blend` | свет, камера, world, пол-тень, фоновые шары, настройки рендера |
| `kit.blend` | заготовки-коллекции `icon_*`: `icon_pedestal`, `icon_card`, `icon_glass_tile`, `icon_coin`, `icon_pearl`, `icon_star` |
| `tests/blender/notka_kit.py` | помощник: `add_icon(name, loc, rot_z, scale)` и `render_pair(base)` |
| `tests/blender/card_run.py` | `shoot()` (с фоном + виньетка), `shoot_alpha()` (прозрачный), `closeup()` |
| `tests/blender/card_scene.py`, `card_lib.py` | исходный скрипт эталона (воспроизводит сцену целиком) |
| `tests/blender/notka_system_build.py` | пересборка materials/rig/kit из эталона |

## Порядок создания новой иконки
1. Открыть `rig.blend`, **не сохранять поверх него**: сразу «Сохранить как» `3D иконки/<имя>.blend`.
2. Подтянуть заготовки через `add_icon(...)` или Append из `kit.blend`. Новые предметы собирать только из материалов `mat_*` (Append из `materials.blend`).
3. Сначала предмет-герой, потом спутники, потом фон (шары уже в `rig_background`).
4. Рендер всегда парой: PNG с фоном + PNG на прозрачном фоне (`render_pair`). Крупный план проверять на 100%.
5. Сравнить с `reference-final.png` рядом. Если выбивается по цвету, свету или глубине, править иконку, не rig.

## Масштаб и привязка
- Единицы сцены: диаметр монеты 1.24, ширина карты 4.08, радиус подиума 3.45. Верх подиума на **z = 0.29**.
- У каждой заготовки корень `icon_*` (Empty) стоит внизу объекта, коллекция называется так же.
- Герой иконки занимает примерно 40-50% высоты кадра; камера и цель не менять.

## Палитра «Румянец» (3D)
Слива `#1A0B16` · роза `#FF2D78` (владелец цвета) · персик `#FFB08E` · пудра `#FFE9DF`. Пропорции ≈ 46/28/16/10.
Градиенты брендбука: «Заря» `#FF2D78 → #FF6F7F → #FFB08E`, «Закат» `#FFE2D2 → #EE905A → #CF5A68 → #47204E`, «Ночь» `#FF2D78 → #47204E → #1A0B16` (роза внизу). Цвета в 3D брать только из брендбука (`брендбук/board.html`) и их смесей, своих не придумывать.
Производные 3D-тона (v-final-2): персиково-розовое золото монет `#FFB6A8`, роза верха подиума `#FF5C95`, **слива** `#4A0D3A` (стенка и кольцо подиума, тёмная монета, слот), глубокая слива `#1A0B16` и `#2D0F24` (внутренние тени, грань тёмной монеты). Жёлтого и рыже-медного нет.
Фон: градиент `#FF7EA6` (низ) → `#FFE6DA` (верх), в world по Window Y.

## Материалы (Principled, Cycles). Источник правды по цвету: `materials.blend`; `card_scene.py` описывает только первую версию эталона
- **Лак/пластик:** Roughness 0.2-0.3 (с Noise ≈ 380 для вариации), Coat Weight 0.5-0.8, Coat Roughness 0.02-0.06. Пример `mat_card_lacquer`: градиент пудра → персик → роза (`#FFD6C4 → #FFB08E → #FF6F7F → #FF2D78`, роза владеет центром) через Color Ramp на Gradient Texture (Mapping scale 0.26, rot Z −0.55).
- **Перламутр `mat_pearl`:** `#FFEAE0`, Metallic 1, Rough 0.26, Coat 0.25.
- **Металл монет `mat_coin_rim_rosegold`:** `#FFB6A8` (персик+пудра+роза, холодный светлый), Metallic 1, Rough 0.2, Coat 0.35; борт рифлёный (80 рифлей, глубина 0.014), грани монеты матовые `mat_coin_face` (Rough 0.5), знак Shape2 `mat_coin_mark` (Rough 0.4, Coat 0.3).
- **Стекло `mat_glass`:** Transmission 1, IOR 1.47, Rough 0.015, оттенок `#FFC4D8`; тень от стекла выключена (`visible_shadow = False`); объект за стеклом обязателен.
- **Слива подиума `mat_pedestal_gloss`:** `#4A0D3A`, Metallic 0, Rough 0.32, Coat 0 (без зеркала, иначе тёплые отражения дают серо-коричневый). Верх `mat_pedestal_top` `#FF5C95`, Rough 0.5 с Ambient Occlusion.
- **Тёмная монета `mat_plum_coin_gloss` / `mat_plum_coin_deep`:** слива `#4A0D3A` / `#2D0F24`, Metallic 0.55 / 0.35, Rough 0.16, Coat 1, Coat Roughness 0.02.
- **Голограмма:** тонкая плоская (высота 0.004-0.005), Thin Film Thickness 300-1000 по оси X.
- Любой материал называется `mat_*`, живёт в `materials.blend`, помечен ассетом. Новый материал сначала добавлять туда.

## Фаски и геометрия
- Острых рёбер нет: любая кромка с Bevel ≥ 0.01 (в масштабе сцены), сегментов 3-7. Эталон: карта 0.04/7, подиум 0.05/5, стекло 0.045/6, чип 0.008, монета 0.01, блёстка r·0.06/4.
- Рельеф и надписи: экструзия 0.008-0.011, фаска ≤ 0.0012, шрифт Unbounded Bold (`tests/blender/fonts/unbounded-700.ttf`), символы поштучно с равным шагом (цифры не слипаются).
- Знак Shape2 только геометрией из SVG (`shape2()` в `card_lib.py`), на монетах ориентирован «вверх» к камере (поворот 31.6° вокруг Z), у верхних монет стопки наклон 13° к камере.

## Схема света (из `rig.blend`, не менять)
| Свет | Позиция | Цвет | Мощность | Размер |
|---|---|---|---|---|
| `rig_key` | (−4.5, −5.5, 6.5) | тёплый белый | 430 Вт | 2.6 |
| `rig_rim` | (5.5, 4.5, 3.5) | розовый (1, 0.5, 0.7) | 420 Вт | 3.0 |
| `rig_back` | (−5.5, 6.0, 3.5) | тёплый (1, 0.93, 0.95) | 520 Вт | 2.4 |
| `rig_fill` | (5.0, −4.5, 1.8) | (1, 0.9, 0.9) | 70 Вт | 6.0 |
| `rig_top` | (0, 0, 7) | белый | 120 Вт | 3.0 |
| `rig_strip` | прямоугольник 0.22×7 по зеркальному лучу от центра карты | белый | 520 Вт | `visible_transmission` выкл. |

Контровой `rig_back` обязателен: он отделяет монеты от подиума. Блик на герое только положением `rig_strip`, не рисованный в материале.
Камера: объектив 58 мм, позиция (6.4, −10.4, 5.5), цель (0.1, −0.4, 1.5). Глубина резкости: фокус на `rig_focus` (центр героя), f/0.55.
Пол `rig_floor_shadow`: shadow catcher, даёт мягкую тень и на прозрачном рендере.

## Рендер
Cycles, GPU (OptiX), 2048×2048, 640 сэмплов, bounces 12, Denoise OIDN с Albedo+Normal и **prefilter = None** (не мылит текст и рифление). View Transform **Standard**, Exposure 0. Виньетка 0.1 в постобработке (оттенок сливовый), только в версии с фоном. Прозрачная версия: Film Transparent, фоновые шары скрыты.

## Правила композиции
- Один главный объект + 2-3 спутника + подиум. Не больше.
- Один тёмный акцент в кадре (слива), не больше одного. Он не должен сливаться с фоном: на сливовом фоне оставлять светлую кромку.
- Передний план: одна размытая жемчужина. Фон: 5-7 настоящих 3D-шаров и жемчужин разного размера и глубины, размытых DOF, не дугой и не рядами.
- Блёсток не больше двух (с фаской и бликом).
- Все предметы стоят на подиуме или явно парят (с запасом по расстоянию, без наезда на героя). Контактные тени обязательны.
- Герой слегка повёрнут (≈ −24° по Z), логотипы читаются целиком и не перекрыты бортиками.

## Запреты
- Чистый белый без градаций (максимум `#FFF3EC`; тиснение и знак только сатин/перламутр).
- Плоские круги вместо боке; эмиссионные диски.
- Сине-фиолетовое, сиреневое, серо-коричневое, серо-фиолетовое; красно-жёлтое, рыже-медное, жёлтый в градиенте. Серые отражения на сливе (проверять передний край подиума).
- AgX, Filmic и любой Look, который гасит розовый.
- Цветные пятна и рисованные полосы в материале карты.
- Двойные контуры у стекла (объёмную галочку класть внутрь толщи, не на лицевую грань).
- Перекрытие логотипа бортиком монеты; обрезанный или «лежащий» знак.
- Менять форму Shape2, подгонять эталон «под вкус».
- Больше 2 кругов правок на одну иконку без разрешения.

## Известные недоработки эталона (не повторять, при случае чинить)
Голограмма серо-сиреневая и слабо переливается; блик на карте слишком белый у правого края; слот карты читается серым металлом, а не врезанной прорезью; фоновые шары идут неровной дугой по верху; слабо проявлена цветная кайма у стекла (дисперсии в Principled нет).

## Проверка на фонах палитры
Каждую иконку проверять на трёх фонах: слива `#1A0B16`, пудра `#FFE9DF`, «Ночь». Композитинг прозрачного PNG (см. `карта_v-final-2_3фона.png`). Тень от shadow catcher на светлых фонах серая: при необходимости тонировать в сливу.

## Тёмный пресет света (`rig-dark.blend`, основной для макетов на сливовом градиенте)
Иконка почти всегда стоит на тёмном сливовом градиенте (пример: `брендбук/Frame 4.png`: слива `#1A0B16` внизу, розовое свечение `#BE2562` сверху по центру). Светлый пресет `rig.blend` остаётся для светлых фонов.
- **World:** тот же градиент (радиальный спад от верхнего центра, Color Ramp с цветами, снятыми с Frame 4). Film Transparent включён, фон в PNG прозрачный, но отражения и свет в стекле, металле и глянце берутся из этого world.
- **Основной:** `rig_key` 900 Вт, очень мягкий (size 7), сверху, тёплый розовато-белый. `rig_top` 140 Вт розовый. `rig_reflect` 260 Вт, большая мягкая панель спереди (иначе металл и жемчуг отражают чёрное и становятся бронзой).
- **Контровые:** `rig_rim` розовый `(1, 0.18, 0.47)` 420 Вт справа, `rig_back` персиковый `(1, 0.69, 0.55)` 420 Вт слева. `rig_edge`: узкая полоса `(1, 0.76, 0.64)` 260 Вт сзади-низко, даёт светлый край подиума.
- **Свечения под подиумом нет** (пользователь отказался). Не добавлять эмиссионные диски и ореолы под подиум.
- **Color Management:** Standard, Exposure 0. **AgX запрещён**: на тёмном фоне он обесцвечивает розу в бледно-лососевый.
- Скрипт пресета: `tests/blender/notka_dark_rig.py` (`apply_dark_rig(params)`), проверка на градиенте: `tests/blender/notka_compose_bg.py`.
- Рендер: `shoot_alpha()` (прозрачный PNG), затем наложить на градиент и посмотреть. Критерий: иконка выглядит частью сцены, а не вырезанной картинкой.
- Известные слабости пресета: стекло значка на тёмном читается как розовое зеркало; тёмная монета (слива) малоконтрастна к фону; на полосе блика на карте остаются почти белые пиксели.
<!-- preserved-brand-asset-rules:end -->
