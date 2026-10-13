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
Branch `plus-wheel-and-perf`. Live app is v177 (2026-10-13: phone mini player has heart + next; heart in rows of playlists/search/albums; setting «new tracks to the start of a playlist» (settings + add sheet); «В любимое» heart animation (spring pop + ring + 11 sparks in brand colours, deflate on remove; heartBurst/heartPop); page under a folding player has no entrance animations (card-in slid the shelf cards in 44 px from the side) via .no-enter; mini player is restored after a restart (track, queue, second; notka_resume_v1); light pose changes in 0.3 s while the player is pulled away; no blink of the small player after the fold (its entrance animation was restarted by pullReset); swipe-down card keeps the player whole with a track-coloured backing, tab bar and mini player there from the first moment (no pop-in at the end); home avatar 54 px on phones; swipe-down fold is a cross-fade (transform+opacity only), page below kept as it was (showScreen keep), no black backing; player swipe-down is a card pull (follows finger, rounds, page shows under it, slides away; also from the top bar and the title block when the text has scrolled with the song); player folds with a swipe down (cover and text), lyrics view without prev/play/next, no same-track retry after a server «could not» + no error flash before the equal version plays; «Нашли оригиналы» — POST /originals + card in «Моё» + confirm sheet (replace saved fan remakes with the real song; strict rules in services/originals.py); YouTube Music search goes DIRECT from the server first, proxy only as fallback (via WARP the labels' official releases are hidden: 4/8 vs 8/8 official in top3); lyrics open on phone: bottom block shrinks, text area +25% (system.css); /warm — the first two search results are prepared on the server while the listener looks (idle server only, 1 at a time, 30/min), tap = instant; download speed: direct route first (proxy only as fallback, direct paused 5 min after a refusal), extractor skip=hls,dash (-0.3 s), first route no retries; post-2022 label releases are «Video unavailable» via the WARP proxy but public direct: direct retry now also on unavailable; FIXED playTrack error branch (track shadowed the analytics function: «track is not a function», so a refused track hung on loading forever, no retry, no skip) since the analytics commit 827b188; BRAND_HUES restored; also: download retried straight from the server when the WARP proxy address is refused (not a bot / 403), metric yt_direct_rescue; cookies from owner were rejected by YouTube («page needs to be reloaded»), file left in place; the lowest background layer follows the light colour (deep colour darkened 30% over #0A0709, also Telegram header/bottom bar and theme-color), no more fixed violet; v162: lyrics when flipping tracks: request delayed 350 ms and the previous one aborted, scroll glide cancelled; v161: word-by-word lyrics fill REMOVED entirely at the owner request, lines only (NetEase code removed too); v159: Минимализм toggle fixed (aria-checked was never updated, could not be turned off), splash without text-stroke and without colors in Минимализм, lyrics words spread over the line time, lighter lyrics rendering on phones: 30 fps fill, blur only near lines and off on touch; before: v158 smooth word fill): track profiles + mood ranking, word-by-word lyrics, download limit.

## Findings and Decisions
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
`music_resolver/services/playlist_import.py`, `music_resolver/api/routes.py` (`/card`), `miniapp/app.js`, `miniapp/styles.css`, `miniapp/index.html`, `deploy/yandex_relay*`, `фидбек/Сводка_фидбека_2026-10-12.md`.

## Validation
Import checked on the live server for Spotify, Yandex, Apple, Deezer, SoundCloud. `/card` endpoint checked with tests (auth, size, type, rate limit). Frontend syntax checked with `node --check`. No device testing done.

## Blockers
- Owner has to export `cookies.txt` (extension «Get cookies.txt LOCALLY», preferably a spare Google account) so that YouTube sign-in checks can be passed; Chrome/Edge cookie DBs cannot be read from the PC.
- Screen recordings for stage 6; error details for stage 7.
- Owner decisions for stage 9.

## Next Action
1. Owner deploys: `! bash deploy/push.sh 94.156.179.229`; then verify served version 156 and `GET /profile?source=youtube_music&id=<id>&artist=<name>` after a few plays, `/analytics` returns 401 without login, and the admin counters `sync_*`, `an_events` appear.
2. Ask reporters (adeline, Степан, Eva) for recordings/details for stages 6-7.

## Resume Context
Reply to the owner in Russian, plain language, no repeated self-criticism (see `CLAUDE.md`). The owner is not a programmer: decide technical things, ask only product questions. Do not edit the 3D reference. Memory notes: `notka-feedback-round-2026-10-12`.
