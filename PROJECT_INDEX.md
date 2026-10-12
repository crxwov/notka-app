# PROJECT_INDEX

Quick structural index of `notka` for fast navigation.
For full modular technical and product documentation in Russian, see **[docs/README.md](docs/README.md)**.

## Overview
**Нотка (`Notka`)** is a Telegram Mini App music player (`miniapp/`) paired with an `aiogram` Telegram bot (`bot/`) and a `FastAPI` multi-provider music resolver and audio caching backend (`music_resolver/`).

## Entrypoints & Launchers
- `start.bat` -> `run_notka.py` — One-click Windows local launcher: loads `.env`, sets `YTDLP_COOKIES_FROM_BROWSER=chrome` by default, boots `uvicorn` (`music_resolver.main:app` + `/app` static mount for `miniapp/`) on `127.0.0.1:$PORT`, creates a `pycloudflared` tunnel (`*.trycloudflare.com`), and launches `python -m bot.main` with `MINIAPP_URL=<tunnel>/app/`.
- `run_server.py` — Production single-process entrypoint (behind Caddy / reverse proxy): mounts `/app` (`miniapp/`) with `Cache-Control: no-cache`, supervises `bot.main` in a background thread (`RUN_BOT=1` by default), and serves `music_resolver.main:app` via `uvicorn`.
- `music_resolver/main.py` — FastAPI app factory, CORS config, and `AppError` exception handlers.
- `bot/main.py` — `aiogram` bot polling entrypoint (`/start` with deep-link payloads `t_`, `p_`, `promo_`; `/id`; `/promo` admin promo management).

## Backend (`music_resolver/`)
- `config.py` — `Settings` loader from env + startup proxy health check (`_usable_proxy`).
- `models.py` — Pydantic models (`TrackCandidate`, `TrackInfo`, `PlaybackInfo`, `ResolvedTrack`, `SearchResponse`, `ResolveResponse`, `AlbumSummary`, `AlbumInfo`, `ArtistInfo`).
- `errors.py` — `ErrorCode` enum, HTTP status mapping, and `AppError`.
- `api/routes.py` — All 20 HTTP endpoints (`/health`, `/search`, `/artists`, `/resolve`, `/album`, `/artist`, `/prepare`, `/stream`, `/download`, `/radio`, `/mood`, `/lyrics`, `/import`, `/plus/status`, `/plus/redeem`, `/events`, `/events/sync`, `/events/advance`, `/events/reset`, `/bot-info`, `/shared`, `/shared/{share_id}`) + disk audio cache in `cache/audio_v2/`.
- `services/`
  - `factory.py` — Wires `MusicService`, `ProviderManager`, `TTLCache`, and all providers.
  - `music_service.py` — High-level search/resolve/album/artist facade with search & resolve caching.
  - `provider_manager.py` — Multi-provider search fan-out (`youtube_music`, `soundcloud`, `youtube_web`), deduplication, and fallback resolution.
  - `matcher.py` — `rapidfuzz` track scoring (`score_track`) and junk/duration filtering.
  - `mood_mix.py` — Mood mix generator (`energetic`, `happy`, `calm`, `sad`) using YT Music radio seeds, top artists, and audio energy features.
  - `energy.py` — `ffmpeg` PCM audio feature extractor (`loud`, `punch`, `bright`, `tempo` -> `energy`) persisted in `data/energy.json`.
  - `lyrics.py` — Synced LRC & plain lyrics fetcher via `lrclib.net` + YouTube Music fallback, cached in `cache/lyrics/`.
  - `playlist_import.py` — Public playlist/album importer for Spotify, Yandex Music, Apple Music, and YouTube / YouTube Music.
  - `plus_store.py` — Telegram WebApp `initData` HMAC-SHA256 verifier, Notka Plus subscription store, and promo code manager (`data/plus.json`).
  - `events_store.py` — Seasonal event engine (`halloween`), daily task unlock/progress, and tier rewards (`data/events.json`).
- `providers/`
  - `base.py` — Abstract `BaseProvider`.
  - `youtube_common.py` — Shared `yt-dlp` extraction, search, cookie fallback, and direct audio download helpers.
  - `youtube_music.py` — `ytmusicapi` search (songs + videos), artist/album lookup, radio generation, and `yt-dlp` stream extraction.
  - `itunes_catalog.py` — Apple iTunes Search/Lookup catalog provider with 3-pass audio matching against YouTube Music / YouTube Web.
  - `soundcloud.py` — SoundCloud search (`scsearch`) and stream resolution via `yt-dlp`.
  - `youtube_web.py` — Standard YouTube search (`ytsearch`) and stream resolution via `yt-dlp`.
- `utils/`
  - `ids.py` — Composite ID (`source:source_id`) builder/parser.
  - `logging.py` — Logging configuration.
  - `remux.py` — `ffmpeg -movflags +faststart` MP4 defragmenter for reliable Telegram WebView playback.

## Frontend (`miniapp/`)
- `index.html` — Single-page Telegram WebApp shell containing 21 screens (`splash`, `onboarding`, `home`, `event`, `search`, `library`, `favorites`, `playlist`, `album`, `artist`, `add-tracks`, `edit-playlist`, `profile`, `account`, `stats`, `sound`, `about`, `mood`, `look`, `plus`, `player`), floating dock, mini-player, and 14 bottom sheets / modals.
- `config.js` — `window.NOTKA_CONFIG` (`API_BASE`).
- `app.js` — Main client controller (~4800 lines: state management in `localStorage` under `notka_state_v2`, audio engine, cover color extraction, screen routing, playlists, lyrics sync, Plus & seasonal events).
- `prism.js` — WebGL2 raymarched prismatic light shader (`window.Prism`) with automatic FPS guard.
- `shredder.js` — Interactive drag-and-drop reorder & paper-shredder track deletion (`window.Shredder`).
- `atmosphere.js` — Dual-canvas seasonal/weather effects (`autumn`, `winter`, `spring`, `halloween` with catchable bats, `newyear` with Verlet-physics pullable garland, `rain`, `night`).
- `pumpkin.js` — Interactive liquid-glass Halloween pumpkin SVG (`window.PumpkinArt`).
- `styles.css`, `atmosphere.css`, `events.css` — Styling for the "Живой свет" (Living Light) design system.

## Deploy & Tests
- `deploy/setup.sh`, `deploy/push.sh`, `deploy/README.md` — Production Ubuntu setup (`systemd` + `Caddy` + `Node 20` + `venv`) and SSH push deployment.
- `tests/serve_local.py` — Local test server on `127.0.0.1:8099` with `NOTKA_TEST_USER=424242` and `NOTKA_FAKE_NOW=2026-10-22`.
- `tests/events_store_test.py` — Unit tests for `events_store` and `plus_store` (10 scenarios).
- `tests/cdp.mjs`, `tests/e2e.mjs` — Headless Chromium CDP driver and 38-assertion E2E test suite.

## Product & Design Docs
- `docs/README.md` — Modular technical & product documentation split by subfolder (`getting-started/`, `backend/`, `providers/`, `services/`, `bot/`, `miniapp/`, `operations/`).
- `PRODUCT.md` — Product vision, audience, feature matrix, and roadmap.
- `DESIGN.md` — "Живой свет" (Living Light) design system guidelines, palette, typography, and component rules.
- `ROADMAP.md` — Operational task tracker.

## Codebase Graph (`codebase-memory`)
- Indexed project ID: `C-Users-hackov-notka` (`1434` nodes, `4674` edges, `77` files across Python `36`, JavaScript `7`, CSS `4`, HTML `2`).
