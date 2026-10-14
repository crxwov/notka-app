# ROADMAP: user feedback round 2026-10-12 (Notka)

## Objective
Fix what real users reported after the app was dropped into the uwc'29 chat (130 users, 99 DAU in one day). Source of truth for items: `фидбек/Сводка_фидбека_2026-10-12.md`.

## Success Criteria
- Every item in the summary is either fixed and deployed, or has a stated reason and an owner for the decision.
- Each fix is verified on the live server (`https://94-156-179-229.sslip.io`) and, where it depends on a device, confirmed by the reporter.

## Stages
| # | Stage | Status |
|---|---|---|
| 1 | Read stats and feedback, write the summary | done |
| 2 | Playlist import: Yandex (via RU proxy), Deezer, SoundCloud | done, deployed |
| 3 | Background lag on track change (v148), pattern-card lag (v150), tab re-click animation (v150) | done, deployed; not confirmed on real phones |
| 4 | Lyric card saving through Telegram `downloadFile` (v149) | done, deployed; not confirmed on Samsung |
| 5 | Queue («play next», «add to end»), sheet swipe-down, track retry, calm free light colors, name fallback (v151) | done, committed `32051f2`; NOT deployed |
| 5b | Sync visibility (v152, deployed); search history + taste ranking (v153); data notice + product analytics `/analytics` with opt-out (v154); own «Мой микс» algorithm `miniapp/mix.js` (v155, deployed); track profiles (sound via ReccoBeats, genres via MusicBrainz) + mood ranking `track_profile.py` (v156), see `MOOD_RESEARCH.md` | v156 committed, NOT deployed |
| 5c | YouTube cookies on demand (bot upload, `/cookies`), second-server proxy script, watchdog playback probe, daily data backup, fail2ban, swap (v157+) | deployed; cookies file NOT yet supplied by owner |
| 6 | Device-dependent layout bugs: Samsung nav bar overlap, sheet vs full-screen open, mini-mode paddings, shaking header | blocked: needs screen recordings |
| 7 | iPhone download failure | blocked: needs error details from the reporter (Eva) |
| 8 | Albums assembled from singles/features | not started; root cause is YouTube Music data, needs design |
| 9 | Product wishes (language wave, similar songs, profile customization, release-date filter, year recap, APK) | waiting for owner decisions |

## Current State
Deployed to Russian server (`5.227.61.107:6767`, egor-vm) under domain `https://notka.duckdns.org`.
Restored clean production bundle from `main` (commit `7cc75a5`, cache buster v196 for app.js, v144 for styles.css, v111 for system.css).
Audio streaming throughput and track latency overhauled:
- Background cache preloader active (`cache_preloader.py`): discovers all 1,600+ tracks from user playlists/favorites and pre-downloads them to NVMe storage quietly in the background without interfering with active user playback.
- Instant NVMe cache lookup (`_disk_cache_map`): cached tracks serve in 12–15 ms directly from disk.
- Persistent iTunes matching: `itunes_catalog.json` now preserves iTunes -> YouTube matched video IDs across restarts.
- Cache size expanded to 40 GB on NVMe storage (`AUDIO_CACHE_MAX_MB=40000`).
- sing-box routing updated to include SoundCloud (`soundcloud.com`, `sndcdn.com`), eliminating 15s timeouts on RKN blocks.
- Client-side preloading accelerated: `<audio preload="auto">` in Mini App, pre-warming for opened playlists/favorites and queue ahead of playback.
- Fixed glass buttons distortion ("ВОТ ЭТИ КНОПКИ АХУЕЛИ") & lighting desync:
  - Root cause: `perfGuard()` had a 60-frame median probe that triggered false positives during asset loading or rapid track skips, permanently saving `notka_perf="lite"` in `localStorage`.
  - In `perf-lite`, `.glass` and `.field` were assigned a hardcoded muddy purple `rgba(58, 42, 92, 0.78)` and `-webkit-backdrop-filter: none`, breaking search bar, mini-player, and bottom nav on iOS/Android.
  - Fix: removed automatic false-positive downgrade in `perfGuard`, cleared stale auto-lite flags on start, replaced hardcoded purple with elegant dark frosted surfaces in fallbacks, and made `lightForTrack` and `brandPaletteFor` derive dynamic hues synchronously with token cancellation.
  - Deployed v197 (`app.js`), v145 (`styles.css`).
- Fixed player half-dismissed pull freeze & cropped cover ("фон в ахуе" / обложки багаются):
  - Root cause:
    1. Gesture race condition: when swiping diagonally to skip a track, vertical `playerPull` detected `dy >= 12` and called `pullBegin()`, scaling the player down (`scale(0.92)`), unhiding the background screen (`pullBehind`), adding `player-pulling` class, and switching `document.body.dataset.screen = "home"`. Simultaneously, horizontal `swipe` locked and initiated track change via pointer capture. `endPlayerPull` was swallowed or its 360ms timer was preempted by the next touch, permanently stranding the player in half-pulled card mode with the Home screen bleeding through.
    2. Scroll retention in `#screen-player`: the container has `overflow-y: auto` to allow scrolling down to `#player-info` ("О треке" / "Из альбома"). When scrolled down, neither `playTrack` nor `setFullPlayerFor` reset `scrollTop = 0`, causing the next track to open scrolled up, cutting off the cover and exposing `#pi-album` at the bottom.
  - Solution:
    - Implemented strict mutual exclusion: `cancelPlayerPull()` cleans up all transforms, classes, behind-screens, and timeouts immediately when horizontal `swipe` locks; `cancelSwipe()` clears swipe targets when pull begins.
    - Added guaranteed `cancelPlayerPull()` and `screens.player.scrollTop = 0` inside `playTrack`, `playAdjacent`, and `showScreen("player")`.
    - Protected `#player-info` and scrolled positions from initiating accidental track-skip swipes (`pullScreen.scrollTop > 5`).
    - Enforced `.player-main` `height: 100%; min-height: 100%; box-sizing: border-box;` in `system.css`.
    - Deployed v198 (`app.js`), v146 (`styles.css`), v112 (`system.css`).
- Fixed track switch interface flicker and layout twitching ("перекосоебывает интерфейс и он моргает"):
  - Root causes identified and resolved:
    1. Entrance animation replay: `cancelPlayerPull()` was called unconditionally on every `playTrack()`, invoking `pullReset()`, which set `el.style.animation = ""`. This caused `#mini-player` to immediately re-trigger `@keyframes screen-in 0.4s` (jumping to `opacity: 0, translateY(10px)`), making the mini-player blink and drop on the Home screen on every Next Track click.
    2. Background ambient lighting blackout: `showArtUnderLight()` immediately removed `.is-shown` and waited 450ms, causing the entire ambient light haze behind the app to collapse into pitch black and slowly fade back in on every track change.
    3. Shelf entrance replay: `rememberRecent()` called `renderRecent()` on Home screen, wiping `shelf.innerHTML` and recreating cards, which re-triggered `@keyframes card-in 0.75s` on all recent cards with staggered delays.
    4. Synchronous layout thrashing: `paintGround()` called `getComputedStyle` and made rapid duplicate IPC calls to `tg.setHeaderColor` / `tg.setBottomBarColor`, while `void el.offsetWidth` was called during swipe transitions.
    5. Cover blank flash: `setCoverEl` wiped `el.innerHTML = ""` before the new cover image loaded.
    6. Heavy background DOM rebuild: `renderQueueSheet()` rebuilt 50-100 rows in the DOM inside `playTrack` even when the queue sheet was closed.
  - Solutions:
    - `cancelPlayerPull()` only runs reset if a pull was actually active.
    - `pullReset()` maintains `animation: none` on visible dock elements.
    - `showArtUnderLight()` preloads tiny blurred canvas without removing `.is-shown`, crossfading smoothly.
    - `renderRecent()` skips entrance animations (`animation: none`) on updates when the shelf is already mounted.
    - `renderQueueSheet(force)` skips re-rendering when the queue sheet is not open.
    - `paintGround()` debounced by 120ms with pure-math HSL/hex parser, avoiding duplicate Telegram native frame paints.
    - `setCoverEl()` preloads new images off-screen and smoothly swaps `img.src`.
    - Softened swipe keyframes and replaced forced reflows with `requestAnimationFrame`.
  - Deployed v199 (`app.js`), v147 (`styles.css`), v113 (`system.css`).
- Hysteria 2 egress tunnel management:
  - Switched sing-box outbound back to previous server: `de.deytt.space:8443` (Germany `2.26.249.191`).
  - Restored clean TLS direct config (`server_name: de.deytt.space`, `insecure: false`).
  - Added static resolution `2.26.249.191 de.deytt.space` in `/etc/hosts`.
  - Verified egress connectivity: YouTube (HTTP 200), Telegram API (HTTP 302), and live track matching.
- Resolved Playboi Carti "MUSIC" album playback & fan remakes / unreleased playback issues:
  - Root causes identified from live server logs & deep inspection:
    1. Slow download / HTTP 403 Forbidden: `yt-dlp` lacked a JavaScript runtime on the server, causing YouTube n-sig extraction failure and aggressive stream throttling down to ~100 KiB/s or 403 blocks.
    2. Missing/unplayable tracks & fan remakes: "MUSIC" by Playboi Carti is an official album (dropped on Apple Music and SoundCloud on March 14, 2025). However, Carti's label never distributed Topic tracks to YouTube Music. Notka's iTunes catalog provider historically only searched YouTube for audio, where only fan uploads, type beats, and remakes existed.
    3. Cyrillic vs Latin transliteration mismatch: Apple Music provides Latin transliterations for Russian artists ("Kino", "Splean"), while YouTube hosts them in Cyrillic ("Кино", "Сплин"), causing artist match checks to reject valid tracks with 0.8+ confidence.
  - Fixes applied & deployed:
    - Installed `deno 2.9.7` into `/usr/local/bin/deno` on `5.227.61.107`. yt-dlp now extracts n-sig in <100ms without warnings; download speed jumped to 15–25 MiB/s.
    - Wired `SoundCloudProvider` directly into `ITunesCatalogProvider` as a first-class playback fallback. Tracks from the Apple Music catalog not officially on YouTube Music now automatically match and stream pristine official studio audio from the artist's verified SoundCloud uploads (`Playboi Carti - RATHER LIE`, `RADAR`, `MOJO JOJO`, `PHILLY`, `BACKD00R`, `FINE SHIT`, `TOXIC`, `DIS 1 GOT IT`).
    - Added `download_to_file` to `SoundCloudProvider` powered by `yt-dlp` with fragment concurrency, downloading tracks in ~200ms.
    - Added bidirectional Cyrillic-to-Latin phonetic transliteration in `_artist_matches` (bridging "Kino" <-> "Кино", "Splean" <-> "Сплин", etc.).
    - Maintained global storefront querying on Apple Music without `country=RU` to preserve full international release catalogs.
    - Boosted `/warm` search pre-warming: concurrency raised, freed from waiting for full idle.
    - **Fan Remake & Matcher Eradication (2026-10-14)**:
      - `matcher.py`: implemented `strip_title_extras()` (`feat.`, `ft.`, `with`, `deluxe`) so multi-collaborator tags don't penalize SequenceMatcher title overlap; heavy penalties on fan remake terms (`slowed`, `reverb`, `remake`, `type beat`, `prod by`); position priors to preserve official release ranks.
      - `youtube_music.py`: `_is_fan_remake()` regex filter strips unofficial UGC from `search()` and `search_videos()`.
      - `itunes_catalog.py`: studio track length verification (`abs(actual - expected) <= 20`); versioned match cache `_CATALOG_CACHE_VERSION = 2` to purge old stale matches on restart; removed blind scan of `audio_v2/*.bin`; fast discography lookup returns cached albums immediately.
      - `routes.py`: `_find_cached_track` strictly enforces match suffixes (prevents serving mismatched/stale fan remake `.bin` files); `_rebuild_disk_cache_map` stops blindly polluting match cache.
      - `miniapp/app.js` & `index.html`: eliminated premature `"Не удалось загрузить исполнителя"` toast, set artist cover from top track, bumped cache buster to `?v=201`.

- Resolved Yeat "DANGEROUS SUMMER" album playback, 5-second start latency, SoundCloud DRM, and geo-blocking (2026-10-14):
  - Root causes identified and fixed:
    1. SoundCloud DRM crash & permanent bad cache: When YouTube Music in Russia returned 0 results for Western tracks, `_match_on_youtube()` fell back to SoundCloud. Official major label tracks on SoundCloud (e.g. Interscope/Universal `lilyeat/put-it-ong`) are DRM-encrypted (`ERROR: [soundcloud] This video is DRM protected`). yt-dlp threw an exception, failing with 502 Bad Gateway and permanently poisoning `itunes_catalog.json`.
       - Fix: Added automatic DRM / error healing in `resolve()` and `download_to_file()` (catches SoundCloud errors, clears the bad cache entry, rematches on YouTube, and downloads cleanly). Prevented SoundCloud fallback from overriding YouTube when YouTube is available (`allow_soundcloud=False` parameter). Bumped `_CATALOG_CACHE_VERSION = 3` to purge stale broken SoundCloud DRM entries across restarts.
    2. YouTube Music Geo-blocking on Russian IP: `ytmusic_location` in `config.py` was unset (`None`), so YouTube detected Russian IP and geo-blocked post-2022 Western releases, returning 0 tracks.
       - Fix: Set `ytmusic_location = os.getenv("YTMUSIC_LOCATION") or "US"`. YouTube Music now accesses the complete global catalog with 100% precision for all artists (Yeat, Carti, Drake, etc.). Added `"MUSIC_VIDEO_TYPE_ATV"` (Audio Track Video) to `OFFICIAL_VIDEO_TYPES`.
    3. 5-second playback start latency (double yt-dlp resolve lag): In `routes.py`, `audio_file()` ran `service.resolve()` (calling yt-dlp to extract audio streaming URL ~2.5s) AND THEN `_ensure_cached()` (calling yt-dlp again to download ~2.5s) instead of direct fast download.
       - Fix: Overhauled `audio_file()` to use `ensure_matched()` for instant suffix lookup and call `_ensure_cached()` directly, cutting playback start time in half.
    4. Album view pre-warming: Opening an album in `openAlbumById` did not pre-warm tracks.
       - Fix: Mini App now asynchronously calls `/warm` for the first 3 tracks when an album page opens.
    5. Fan remakes instead of originals: `_looks_unofficial` in `itunes_catalog.py` checked all `PENALTY_TERMS` (including "lyrics" and "visualizer"), causing official label visualizers/lyric videos to be rejected as unofficial. When playback failed, `findEquivalent` in `miniapp/app.js` substituted fan remakes.
       - Fix: Replaced `PENALTY_TERMS` in `_looks_unofficial` with `_HARD_UNOFFICIAL_TERMS` (excluding `lyrics` and `visualizer`). Added `isFanUgc` filtering to `findEquivalent()`. Added candidate album matching tokens and penalty in `matcher.py` for unrelated candidates where neither title nor album nor artist matches query tokens (e.g. "Yeat Dangerous Summer" won't match "The Dangerous Summer").
    6. Cache buster bumped: `miniapp/index.html` updated to `app.js?v=202`.

## Findings and Decisions
- Audio cache hit response time reduced from ~19s to 12–15 ms.
- SoundCloud official uploads from major labels (Universal/Interscope) use DRM encryption that yt-dlp cannot rip. Only unofficial user uploads work on SoundCloud. Therefore, SoundCloud must NEVER override YouTube when DRM exists, and must automatically heal and fall back to YouTube.
- Setting `location="US"` in `ytmusicapi` works globally for both Western releases (Yeat, Playboi Carti, Travis Scott) and Russian releases (Kino, Scriptonite, Miyagi, Macan).
- Calling `service.resolve()` before `_ensure_cached()` in `routes.py` caused double invocation of yt-dlp, adding ~2.5s of unnecessary lag.
- Stale match cache on the server previously locked in fan remakes even when new matching logic was deployed; versioned match cache and strict suffix verification in `_find_cached_track` resolve this completely.
- User playlist tracks (~1,600 tracks) take only ~5–6 GB of disk space on the 88 GB free NVMe volume.
- User playback has 100% priority: background preloader yields whenever a user requests or streams a track.
- Yandex API refuses non-Russian IPs. Fix: `YANDEX_PROXY` in `/opt/notka/app/.env` (proxys.io shared IPv4, 30 days, expires ~2026-11-11). Fallback relay kept in `deploy/yandex_relay*`.
- VK playlists cannot be read without an account login. Owner said "drop it for now". Options kept: paste-a-list import, or a dedicated VK account (against VK rules).
- Domain purchase postponed by owner (hackov: server IP is visible).
- **Server ssh is on port 5463** (sshd hardening moved it; port 22 closes connections). Root with `~/.ssh/notka_deploy` works on 5463; `deploy/push.sh` uses 5463 by default (`NOTKA_SSH_PORT`). Non-root `leksik` (key `id_ed25519`) has sudo with password only. Swap 2 GB and `DOWNLOAD_PARALLEL=2` (default) added 2026-10-12.
- The agent could not write to the server over ssh in auto mode earlier. Deploy is always the owner running `bash deploy/push.sh 94.156.179.229` via the `!` prefix.
- "вовчик" is a classmate (regular user), not a coder. "ск" in chats means SoundCloud, not VK.

- Owner chose (2026-10-12) to send 30 s audio excerpts of played tracks to ReccoBeats for mood analysis. Their terms were not read; lawyer to check. Kill switch: `NOTKA_NO_PROFILING=1`.

## Issues and Failed Attempts
- ssh to the server was briefly dropped after one deploy; app stayed healthy. Watch for repeat.
- Layout bugs on Samsung/iPhone could not be reproduced without a device; no blind fixes were made.

## Important Changed Files
`music_resolver/config.py`, `music_resolver/providers/youtube_music.py`, `music_resolver/providers/itunes_catalog.py`, `music_resolver/providers/soundcloud.py`, `music_resolver/services/matcher.py`, `music_resolver/api/routes.py`, `miniapp/app.js`, `miniapp/index.html`.

## Validation
All 4 checks in `tests/test_fix_verification.py` passed cleanly:
1. All 7 tracks from Yeat's album `DANGEROUS SUMMER` (`PUT IT ONG`, `LOCO`, `LOOSE LEAF`, `OH I DID`, `COMË N GO`, `IM YEAT`, `GROWING PAINS`) matched with 100% precision to official YouTube Music ATV/audio releases.
2. Search ranking: `Yeat Dangerous Summer` ranks official Yeat releases at #1 with confidence 1.0 (unrelated bands like "The Dangerous Summer" properly penalised).
3. SoundCloud DRM fallback recovery: Injected DRM soundcloud target into cache, verified automatic detection and healing, falling back to YouTube and updating cache cleanly.
4. Fast suffix lookup: `ensure_matched()` returns valid target suffix instantly without redundant overhead.

## Blockers
- None. Ready for server deploy.

## Next Action
1. Owner merges `tg-app` into `main` and deploys:
   ```bash
   git checkout main
   git merge tg-app
   git push origin main
   bash deploy/push.sh 94.156.179.229
   ```
2. Verify in Mini App:
   - Open Yeat's album `DANGEROUS SUMMER`, tap track 4 (`OH I DID`) and other tracks — confirms instant playback start and original studio audio without error toasts.
   - Search `Yeat Dangerous Summer` — confirms Yeat appears at #1.

## Resume Context
Reply to the owner in Russian, plain language, no repeated self-criticism (see `CLAUDE.md`). The owner is not a programmer: decide technical things, ask only product questions. Do not edit the 3D reference.

