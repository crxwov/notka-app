# PROJECT_INDEX

Current source routing index. Documentation: [docs/README.md](docs/README.md).

## Team and operating context

Two developers maintain Notka: **Lexic**, original creator of the product/design/functionality, and **hackov (Egor / crxwov)**, who joined later and contributes to clients, infrastructure and shared development. Agents must preserve both people's work.

- [Collaboration](docs/operations/collaboration.md): roles, tg-app/app-dev/main, integration and release coordination.
- [AGENTS.MD](AGENTS.MD), [CLAUDE.md](CLAUDE.md): agent and brand rules; ROADMAP.md: current task.
- [Infrastructure snapshot](docs/operations/infrastructure-2026-10-14.md): verified live state and unverified boundaries, dated 2026-10-14.

## Entrypoints

- `start.bat` / `run_notka.py`: Windows local backend, temporary Cloudflare URL and bot. Do not run production's bot token concurrently with its polling process.
- `run_server.py`: production parent process; loads .env, constructs FastAPI, mounts miniapp, runs loopback Uvicorn, supervises separate bot process, starts watchdog and backups.
- `music_resolver/main.py`: FastAPI factory, error handlers and static mount. Do not assume CORS configuration exists without checking current code.
- `bot/main.py`: aiogram long polling, deep links, promo/owner commands, inline audio, login delivery and cookie upload.

## Backend

- `music_resolver/api/routes.py`: active HTTP handlers and disk audio caching; source of truth for routes. Same-name `api/routes/` is not an active modular source package in this snapshot.
- `config.py`, `models.py`, `errors.py`: settings, response models, application errors.
- `services/factory.py`, `music_service.py`, `provider_manager.py`: provider wiring, caching and search/resolve orchestration.
- `services/matcher.py`: scoring/filtering using Python difflib and text normalization.
- `services/cache_preloader.py`: account-track background downloads; `proxy_guard.py`: application proxy checks/fallback.
- `providers/youtube_music.py`, `youtube_common.py`, `youtube_web.py`: YouTube Music/catalog/radio and yt-dlp search/download paths.
- `providers/itunes_catalog.py`: iTunes metadata catalog plus audio matching on YouTube/SoundCloud; Apple catalog is not Apple playback.
- `providers/soundcloud.py`, `base.py`: SoundCloud and provider contract.
- `services/auth_store.py`, `sync_store.py`, `plus_store.py`, `events_store.py`: sessions, account state, promotions and events in JSON.
- `services/metrics.py`, `admin_stats.py`: counters, users and owner statistics.
- `services/playlist_import.py`, `lyrics.py`, `credits.py`: public playlist metadata, lyrics and credits.
- `services/track_profile.py`, `energy.py`, `mood_mix.py`, `mix_quality.py`, `originals.py`: audio/genre features and discovery.
- `cache/ttl.py`: process-local TTL cache; `utils/ids.py`, `logging.py`, `remux.py`: IDs, logging, ffmpeg container repair.

## Clients

- `miniapp/index.html`, `config.js`, `app.js`: active Telegram web shell, API base and monolithic application.
- `miniapp/styles.css`, `system.css`, `plus.css`, `events.css`, `atmosphere.css`: styles actually shipped to the web client.
- `miniapp/mix.js`, `prism.js`, `atmosphere.js`, `shredder.js`, `pumpkin.js`: mix and visual effects.
- `android/app/src/main/java/space/notka/app/`: Java WebView, JavaScript bridge, playback service/MediaSession.
- `android/app/src/main/assets/miniapp/`: separately bundled Android frontend, with modular src and styles. Web deployment does not replace installed APK assets.
- `admin/index.html`: owner dashboard, protected by reverse proxy Basic Auth rather than independent handler login.

## Data and operations

- `data/`: private account/session/sync/Plus/events/analytics JSON; never add to Git.
- `cache/`: regenerable audio and metadata, but cache/shared also stores published playlist records. Audio eviction is not a global quota.
- `backups/`: data archives; current backup scope excludes .env, infrastructure config, cookies and published cache/shared records.
- `deploy/push.sh`: git archive HEAD deployment, dependency update, restart and health check. Deployment is an explicit separate release action.
- `deploy/setup.sh`: bootstrap template, not a copy of current nginx/NAT/Caddy/sing-box/Certbot configuration.
- [Deployment guide](docs/operations/deployment.md): current target and coordination requirements.

## Validation routing

Existing examples (not a claim of complete coverage): `tests/events_store_test.py`, `tests/test_fix_verification.py`, `tests/serve_local.py`, `tests/cdp.mjs`, `tests/e2e.mjs`, `tests/account_sync.mjs` and other focused scripts under tests. Inspect a script before running: some checks can download music, use external services or interact with accounts.

Earlier index entries test_api_routes.py/test_itunes_provider.py/test_youtube_provider.py/test_models.py/test_services.py/test_utils.py do not exist in this checkout. Select checks from actual files and validate on the relevant runtime/device when needed.

## Product and integrations

- `PRODUCT.md`, `DESIGN.md`: product and visual contracts.
- `docs/`: topical technical docs. The source index and dated live report take priority over obsolete claims of modularization or old server addresses.
- Codebase Knowledge Graph integration remains in AGENTS.MD. Prefer its tools when available. Recorded project ID: `C-Users-hackov-notka`; previous graph counts are historical and must not be presented as a current inventory.
