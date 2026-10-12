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
| 6 | Device-dependent layout bugs: Samsung nav bar overlap, sheet vs full-screen open, mini-mode paddings, shaking header | blocked: needs screen recordings |
| 7 | iPhone download failure | blocked: needs error details from the reporter (Eva) |
| 8 | Albums assembled from singles/features | not started; root cause is YouTube Music data, needs design |
| 9 | Product wishes (language wave, similar songs, profile customization, release-date filter, year recap, APK) | waiting for owner decisions |

## Current State
Branch `plus-wheel-and-perf`. Live app is v155. v156 (track profiles + mood ranking) is committed, not deployed.

## Findings and Decisions
- Yandex API refuses non-Russian IPs. Fix: `YANDEX_PROXY` in `/opt/notka/app/.env` (proxys.io shared IPv4, 30 days, expires ~2026-11-11). Fallback relay kept in `deploy/yandex_relay*`.
- VK playlists cannot be read without an account login. Owner said "drop it for now". Options kept: paste-a-list import, or a dedicated VK account (against VK rules).
- Domain purchase postponed by owner (hackov: server IP is visible).
- The agent cannot write to the server over ssh in auto mode. Deploy is always the owner running `bash deploy/push.sh 94.156.179.229` via the `!` prefix.
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
- Screen recordings for stage 6; error details for stage 7.
- Owner decisions for stage 9.

## Next Action
1. Owner deploys: `! bash deploy/push.sh 94.156.179.229`; then verify served version 156 and `GET /profile?source=youtube_music&id=<id>&artist=<name>` after a few plays, `/analytics` returns 401 without login, and the admin counters `sync_*`, `an_events` appear.
2. Ask reporters (adeline, Степан, Eva) for recordings/details for stages 6-7.

## Resume Context
Reply to the owner in Russian, plain language, no repeated self-criticism (see `CLAUDE.md`). The owner is not a programmer: decide technical things, ask only product questions. Do not edit the 3D reference. Memory notes: `notka-feedback-round-2026-10-12`.
