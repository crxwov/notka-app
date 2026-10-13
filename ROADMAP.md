# ROADMAP

## Objective
Build and deploy a full-featured Android mobile application for Notka (`Нотка`), preserving the complete visual identity, animations, and frontend features from the Telegram Mini App ("Живой свет" / Living Light, WebGL2 Prism shader, seasonal atmosphere canvas, player, 21 screens, playlists, lyrics sync), with full backend integration, remote production server routing, Telegram username authentication with 6-digit DM bot confirmation code, background playback support, and on-device validation on the connected Android 13 phone.

## Success Criteria
- [x] Native Android app project (`android/`) created with ultra-fast offline toolchain build pipeline (< 4s per build).
- [x] All miniapp UI, assets, and shaders bundled into the APK (instant startup, offline capability for local features).
- [x] High-performance WebView container with hardware-accelerated WebGL2, edge-to-edge immersive styling matching theme `#0C0A12`.
- [x] Native Android bridge:
  - [x] Telegram WebApp mock & haptic feedback via Android Vibration API.
  - [x] Hardware back navigation closing active sheets/modals before exiting.
  - [x] Safe-area insets injection for status/navigation bars.
- [x] Background audio service & MediaSession notification (music continues playing with screen off, lock screen controls).
- [x] 100% production server routing: all requests route to `https://94-156-179-229.sslip.io` without local proxies.
- [x] Telegram authentication & database synchronization:
  - [x] Telegram username check against production `users.json`.
  - [x] 6-digit confirmation code delivered directly to the user via Telegram Bot API DM.
  - [x] Code verification generating persistent session tokens (`X-Auth-Token`).
  - [x] Synchronized personal data (favorites, playlists, history, stats) pulled from `data/sync/<user_id>.json`.
  - [x] Logout option in Account settings.
- [x] Production backend & miniapp deployed to remote VPS.
- [x] APK successfully built, installed, and verified on connected TECNO CH6i (Android 13) device via ADB.

## Stages
1. Completed — Toolchain verification & ultra-fast local Android build pipeline setup (`android/tools/`, `aapt2`, `ecj`, `d8`, `uber-apk-signer`).
2. Completed — Android project creation (`android/app/`), hardware-accelerated WebView shell, asset bundling, and native bridge (`MainActivity`, `WebAppInterface`).
3. Completed — Background audio service (`MediaPlaybackService`), `MediaSession` notification controls, and Telegram WebApp polyfill (`telegram-web-app.js`).
4. Completed — Production infrastructure routing & remote server synchronization (`https://94-156-179-229.sslip.io`).
5. Completed — Backend Telegram auth service (`auth_store.py`) & API routes (`POST /auth/request-code`, `POST /auth/verify-code`, `GET /auth/me`), deployed to VPS (`notka.service`).
6. Completed — Frontend Living Light auth screen (`miniapp/auth.css`, `miniapp/index.html`, `miniapp/app.js`), bundled into Android APK assets and deployed to VPS.
7. Completed — Live device deployment & end-to-end verification on connected TECNO CH6i phone (Telegram auth flow, negative case validation, code confirmation, full database sync, background streaming over HTTPS, MediaSession notification).
8. Completed — Artwork & CDN bypass proxy (`GET /artwork`) with disk caching, CORS headers for canvas Living Light shader, and mobile token propagation for Plus/Events/Analytics.
9. Completed — Git repository commit, tag, and first GitHub beta release `v0.0.1` (`0.0.1`) with standalone Android APK asset attached.
10. Completed — Multi-branch workflow setup: user branch `app-dev`, agent branch `tg-app`, production deploy branch `main` with bidirectional sync protocol (`AGENTS.md`).

## Current State
Repository branching strategy configured: `app-dev` (user app development), `tg-app` (agent Telegram app development), and `main` (production deployment). Active working branch for agent set to `tg-app`. All branches pushed to remote origin.

## Findings / Decisions
- **Connected Device**: TECNO CH6i (`08357252AA002939`, Android 13, API 33, 1080x2460 display).
- **Fast Build Pipeline**: Standalone offline pipeline using `aapt2`, `ecj.jar`, `r8.jar`, and `uber-apk-signer.jar` builds and signs in **~3.8s**.
- **Remote Infrastructure**: All app network calls (search, streaming, auth, sync, plus, analytics) point directly to the live production server over HTTPS (`https://94-156-179-229.sslip.io`).
- **Telegram Bot Authentication**:
  - `music_resolver/services/auth_store.py` matches username/id in production `users.json`.
  - Sends 6-digit confirmation code via Bot API `sendMessage`.
  - Rate limiting (30s) and TTL (5 min).
  - Verifying the code yields persistent session token stored in `localStorage.getItem("notka_auth_token")` and passed via `X-Auth-Token` header.
  - Automatically loads and applies `sync_store.load(user_id)` into local storage.
- **Background Playback**: `MediaPlaybackService` runs as a foreground service with `MediaSession`, `Notification.MediaStyle`, and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission. Tested with screen off / Home button: music continues uninterrupted.

## Validation
- **Negative Auth Test**: Entered non-existent username -> returned friendly Russian error: "Пользователь с таким ником не найден в базе Нотки. Сначала открой нашего бота в Telegram и нажми /start!".
- **Positive Auth Test**: Entered user's Telegram username -> received 6-digit code via Telegram Bot -> entered code in app -> authenticated successfully.
- **Database Sync**: Personal account loaded (`hackov_crew`, 22 minutes listened, 28 tracks, 17 artists, playlist "My Playlist #15" with 965 tracks).
- **Audio Playback**: Full player playing tracks streamed directly from `https://94-156-179-229.sslip.io/stream`.
- **Background Mode**: Minimized to home launcher via `KEYCODE_HOME` — playback continued uninterrupted (`currentTime` progressing to 71s+).
- **Notification Controls**: System notification with Play/Pause/Next/Prev verified via `dumpsys notification`.
- **Screenshots Captured**:
  - `auth_screen_after_sheet.png` (Living Light login screen)
  - `auth_not_found.png` (error state on unknown user)
  - `auth_code_step.png` (6-digit confirmation code input)
  - `app_authenticated.png` (Home screen with synced mix & recent tracks)
  - `app_library.png` (Library screen with synced playlists)
  - `app_profile.png` (Profile screen with user stats & Telegram handle)
  - `app_unlocked.png` (Full screen player with WebGL2 caustic shader)

## Blockers
- None.

## Next Action
Ready for user presentation and ongoing usage.
