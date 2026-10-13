# 📚 Документация проекта «Нотка» (Notka)

Добро пожаловать в документацию **«Нотки»** — музыкального Telegram Mini App приложения, Telegram-бота и мультипровайдерного бэкенд-резолвера аудиопотоков.

Документация разбита на небольшие тематические файлы по папкам, чтобы любой раздел можно было быстро открыть и прочитать отдельно.

---

## 🗂 Оглавление по разделам

### 1. 🚀 Быстрый старт и устройство (`getting-started/`)
- **[Обзор архитектуры и режимов запуска](getting-started/overview.md)** — общая схема взаимодействия Telegram, FastAPI, бота и внешних источников; 3 точки входа (`run_notka.py`, `run_server.py`, `serve_local.py`).
- **[Конфигурация и переменные `.env`](getting-started/configuration.md)** — полный справочник переменных окружения, автопроверка прокси (`_usable_proxy`) и настройка cookies.
- **[Карта папок и файлов](getting-started/project-structure.md)** — наглядное дерево всех директорий и модулей репозитория.

### 2. ⚙️ Бэкенд и HTTP API (`backend/`)
- **[Модели данных, ID и коды ошибок](backend/models-and-errors.md)** — составные идентификаторы `source:id`, Pydantic-схемы (`TrackInfo`, `AlbumInfo`, `ArtistInfo`) и таблица HTTP-ошибок (`ErrorCode`).
- **[Справочник HTTP API (все 20 эндпоинтов)](backend/http-api.md)** — параметры запросов и форматы ответов для поиска, каталога, радио, лирики, импорта, Плюса, ивентов и шеринга.
- **[Пайплайн аудио-стриминга и кэша](backend/audio-streaming.md)** — зачем нужен `/prepare`, как работает дефрагментация `ffmpeg -movflags +faststart` (`remux.py`), Range-стриминг `/stream` и LRU-очистка диска.

### 3. 🎵 Провайдеры музыки и поиск (`providers/`)
- **[Параллельный поиск и скоринг треков](providers/overview-and-scoring.md)** — работа `ProviderManager`, дедупликация выдачи и формула ранжирования `score_track` в `matcher.py`.
- **[Провайдеры YouTube Music и YouTube Web](providers/youtube.md)** — устройство `YoutubeMusicProvider`, `YoutubeWebProvider`, фильтрация мусора и адаптер `YoutubeCommon` (`yt-dlp`).
- **[Провайдеры iTunes Catalog и SoundCloud](providers/itunes-and-soundcloud.md)** — витрина альбомов Apple Music / iTunes, 3-ступенчатый алгоритм матчинга аудио `_match_audio` и поиск в SoundCloud.

### 4. 🧠 Внутренние сервисы (`services/`)
- **[Миксы по настроению и анализ аудио-энергетики](services/mood-and-energy.md)** — как `energy.py` измеряет громкость, панч, яркость и темп через `ffmpeg`, и как `mood_mix.py` собирает персональный микс.
- **[Караоке-тексты и импорт плейлистов](services/lyrics-and-import.md)** — синхронные LRC-тексты из `LRCLIB` (`lyrics.py`) и парсер публичных плейлистов Spotify, Яндекс Музыки, Apple Music и YouTube (`playlist_import.py`).
- **[Подписка «Нотка Плюс» и сезонные ивенты](services/plus-and-events.md)** — криптографическая проверка `Telegram.WebApp.initData`, система промокодов (`plus_store.py`) и механика ивента «Хэллоуин в Нотке» (`events_store.py`).

### 5. 🤖 Telegram-бот (`bot/`)
- **[Устройство Telegram-бота](bot/telegram-bot.md)** — команды `/start`, `/id`, `/promo`, обработка deep-link ссылок (`t_`, `p_`, `promo_`) и администрирование промокодов.

### 6. 📱 Фронтенд Mini App (`miniapp/`)
- **[Все 21 экран и 14 модальных окон](miniapp/screens-and-modals.md)** — подробный справочник всех экранов и шторок интерфейса в `index.html` и `app.js`.
- **[Аудио-движок плеера и состояние `localStorage`](miniapp/audio-and-state.md)** — предзагрузка треков, обход багов длительности в WebView, скраббинг пальцем по пластинке/CD/кассете, кроссфейд и схема `notka_state_v2`.
- **[Дизайн-система «Живой свет» и графические движки](miniapp/visual-engines.md)** — динамическая палитра обложек, WebGL2-призма (`prism.js`), бумажный шредер (`shredder.js`), сезонные частицы и физическая гирлянда (`atmosphere.js`), стеклянная тыква (`pumpkin.js`).

### 7. 🛠 Деплой и тестирование (`operations/`)
- **[Деплой в продакшен на VPS](operations/deployment.md)** — автоустановка на Ubuntu (`deploy/setup.sh`), `systemd`-сервис `notka`, `Caddy` HTTPS и выкатка обновлений (`deploy/push.sh`).
- **[Тестирование и технические нюансы](operations/testing-and-caveats.md)** — запуск юнит-тестов ивентов, 38 браузерных E2E-проверок по CDP (`tests/e2e.mjs`), нюансы `TTLCache` и YouTube cookies.

---

## Дополнительные документы в корне репозитория
- **[README.md](../README.md)** — краткая карточка проекта и быстрый запуск.
- **[PRODUCT.md](../PRODUCT.md)** — продуктовый паспорт, целевая аудитория и роадмап фич.
- **[DESIGN.md](../DESIGN.md)** — гайдлайн дизайн-системы «Живой свет» (Living Light).
- **[PROJECT_INDEX.md](../PROJECT_INDEX.md)** — краткий индекс файлов и модулей.
