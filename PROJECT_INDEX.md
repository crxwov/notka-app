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
- `api/routes/` — Modularized HTTP route handlers (all <= 220 lines each):
  - `audio.py` & `audio_cache.py` — `/stream`, `/inline`, `/prepare`, `/download` + disk audio caching in `cache/audio_v2/`.
  - `search.py` — `/search`, `/artists`, `/resolve`, `/album`, `/artist`, `/radio`, `/mood`.
  - `auth.py` — Telegram code verification & session endpoints (`/auth/send-code`, `/auth/verify-code`, `/auth/me`, `/sync`).
  - `plus.py` — `/plus/status` and `/plus/redeem`.
  - `events.py` — `/events`, `/events/sync`, `/events/advance`, `/events/reset`.
  - `content.py` — `/lyrics` and `/import`.
  - `playlists.py` — `/playlists`, `/playlist/create`, `/playlist/edit`.
  - `media.py` — `/media/artwork`, `/media/cover`.
  - `admin.py` — `/metrics`, `/bot-info`, admin stats.
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
  - `youtube/` (`provider.py`, `mappers.py`, `moods.py`) — Modularized YouTube Music provider (ytmusicapi + yt-dlp).
  - `itunes/` (`provider.py`, `matcher.py`, `parser.py`, `cache.py`) — Modularized Apple iTunes Search/Lookup provider with 3-pass matcher.
  - `soundcloud.py` — SoundCloud search (`scsearch`) and stream resolution via `yt-dlp`.
  - `youtube_web.py` — Standard YouTube search (`ytsearch`) and stream resolution via `yt-dlp`.
- `utils/`
  - `ids.py` — Composite ID (`source:source_id`) builder/parser.
  - `logging.py` — Logging configuration.
  - `remux.py` — `ffmpeg -movflags +faststart` MP4 defragmenter for reliable Telegram WebView playback.

## Frontend (`miniapp/`)
- `index.html` — Single-page Telegram WebApp shell containing 21 screens, floating dock, mini-player, and 14 bottom sheets / modals.
- `config.js` — `window.NOTKA_CONFIG` (`API_BASE`).
- `src/` — Modular client architecture (< 465 lines per file):
  - `core/` (`env.js`, `state.js`, `sync.js`, `analytics.js`, `dom.js`) — Environment, reactive state, cross-device sync, analytics.
  - `player/` (`engine.js`, `controls.js`, `lighting.js`, `lyrics.js`, `queue.js`, `resolver.js`, `loudness.js`) — Audio engine, living light, synced lyrics.
  - `ui/` (`navigation.js`, `modals.js`, `track_row.js`, `context_menu.js`) — Navigation, dialogs, bottom sheets, reusable track cards.
  - `screens/` (`home.js`, `search.js`, `library.js`, `playlist_detail.js`, `playlist_create.js`, `profile.js`, `settings.js`, `appearance.js`, `events.js`, `wave.js`, `stats.js`, `recap.js`, `artist.js`) — Self-contained screen controllers.
  - `app.js` — Client bootstrapper and dependency coordinator.
- `styles/` — Modular CSS architecture:
  - `base.css`, `controls.css`, `components.css`, `player.css`, `animations.css`
  - `screens/main.css`, `screens/special.css`
  - `system/desktop.css`, `system/layout.css`
- `atmosphere/` (`core.js`, `shapes.js`, `themes_nature.js`, `themes_seasonal.js`) — Weather, seasonal themes, and particle canvas effects.
- `shredder/` (`engine.js`, `drag.js`, `physics.js`, `strips.js`) — Physics-based paper shredder track deletion.
- `prism.js` — WebGL2 raymarched prismatic light shader (`window.Prism`) with automatic FPS guard.
- `pumpkin.js` — Interactive liquid-glass Halloween pumpkin SVG (`window.PumpkinArt`).

## Deploy & Tests
- `deploy/setup.sh`, `deploy/push.sh`, `deploy/README.md` — Production Ubuntu setup (`systemd` + `Caddy` + `Node 20` + `venv`) and SSH push deployment.
- `tests/` — Automated test suite:
  - `test_api_routes.py` — Tests for public endpoints (`/health`, `/search`, `/artists`, `/resolve`, `/plus/status`, `/events`).
  - `test_itunes_provider.py` — iTunes parser, caching, and matching tests.
  - `test_youtube_provider.py` — YouTube mappers, moods, and provider queries.
  - `test_models.py` — Pydantic models serialization and conversions.
  - `test_services.py` — Matcher ranking, auth store verification, plus store grants.
  - `test_utils.py` — Utility tests (IDs, logging configuration).
  - `events_store_test.py` — Unit tests for seasonal event engine and quests.
  - `serve_local.py`, `cdp.mjs`, `e2e.mjs` — Local test server and headless Chromium E2E suite.

## Product & Design Docs
- `docs/README.md` — Modular technical & product documentation split by subfolder (`getting-started/`, `backend/`, `providers/`, `services/`, `bot/`, `miniapp/`, `operations/`).
- `PRODUCT.md` — Product vision, audience, feature matrix, and roadmap.
- `DESIGN.md` — "Живой свет" (Living Light) design system guidelines, palette, typography, and component rules.

## Codebase Graph (`codebase-memory`)
- Indexed project ID: `C-Users-hackov-notka` (`1434` nodes, `4674` edges, `77` files across Python `36`, JavaScript `7`, CSS `4`, HTML `2`).
