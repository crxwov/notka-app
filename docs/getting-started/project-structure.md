# Карта папок и файлов репозитория

[← Конфигурация и `.env`](configuration.md) · [К оглавлению](../README.md) · [Далее: Модели данных и ошибки →](../backend/models-and-errors.md)

---

```text
notka/
├── README.md                        # Главная карточка проекта и быстрый старт
├── PRODUCT.md                       # Продуктовый паспорт, позиционирование, ЦА, роадмап
├── DESIGN.md                        # Спецификация дизайн-системы «Живой свет» (Living Light)
├── PROJECT_INDEX.md                 # Краткий технический индекс модулей
├── ЗАПУСК.txt                       # Памятка по локальному запуску на Windows
├── requirements.txt                 # Зависимости Python
├── start.bat                        # Windows-лаунчер в 1 клик
├── run_notka.py                     # Локальный оркестратор (FastAPI + Cloudflare Tunnel + Bot)
├── run_server.py                    # Продакшен-оркестратор (FastAPI + супервайзер бота)
│
├── docs/                            # Модульная документация проекта (эта папка)
│   ├── README.md                    # Оглавление документации
│   ├── getting-started/             # Архитектура, .env и структура папок
│   ├── backend/                     # Модели, HTTP API и пайплайн аудио-стриминга
│   ├── providers/                   # Провайдеры музыки и скоринг поисковой выдачи
│   ├── services/                    # Миксы настроения, энергия, тексты, импорт, Плюс, ивенты
│   ├── bot/                         # Telegram-бот и админка промокодов
│   ├── miniapp/                     # Экраны, аудио-движок и шейдеры/эффекты фронтенда
│   └── operations/                  # Деплой на VPS, автотесты и технические нюансы
│
├── bot/                             # Telegram-бот (aiogram 3.x)
│   ├── config.py                    # Чтение BOT_TOKEN и MINIAPP_URL
│   └── main.py                      # Хэндлеры /start (deep links), /id, /promo
│
├── music_resolver/                  # Бэкенд FastAPI и резолвер музыки
│   ├── main.py                      # Фабрика FastAPI, CORS, глобальные обработчики ошибок
│   ├── config.py                    # Settings + автопроверка прокси (_usable_proxy)
│   ├── models.py                    # Pydantic-схемы треков, альбомов, артистов и ответов
│   ├── errors.py                    # Перечисление ErrorCode и исключение AppError
│   ├── api/
│   │   └── routes/                  # Модульные роуты API (все файлы <= 220 строк)
│   │       ├── audio.py             # Стриминг и инлайн-аудио (/stream, /inline)
│   │       ├── audio_cache.py       # Дисковый кэш, прогрев и подготовка (/prepare)
│   │       ├── search.py            # Поиск, резолв, альбомы, артисты, радио
│   │       ├── auth.py              # Авторизация через Telegram код и сессии
│   │       ├── plus.py              # Подписка Нотка Плюс и промокоды
│   │       ├── events.py            # Сезонные ивенты и синхронизация прогресса
│   │       ├── content.py           # Тексты песен и импорт плейлистов
│   │       ├── playlists.py         # Управление плейлистами
│   │       ├── media.py             # Проксирование обложек и медиа
│   │       └── admin.py             # Метрики, системная инфа и админка
│   ├── providers/
│   │   ├── base.py                  # Абстрактный интерфейс BaseProvider
│   │   ├── youtube_common.py        # Общая обвязка yt-dlp (поиск, экстракт, скачивание)
│   │   ├── youtube/                 # Модульный провайдер YouTube Music (<260 строк/файл)
│   │   │   ├── provider.py          # Основной класс провайдера
│   │   │   ├── mappers.py           # Преобразование данных ytmusicapi в TrackCandidate
│   │   │   └── moods.py             # Категории настроений и радио
│   │   ├── itunes/                  # Модульный каталог Apple iTunes (<250 строк/файл)
│   │   │   ├── provider.py          # Каталог и 3-ступенчатый резолв
│   │   │   ├── matcher.py           # Поиск совпадений в YouTube Music / Web
│   │   │   ├── parser.py            # Парсинг ответов iTunes API
│   │   │   └── cache.py             # In-memory кэш артистов и альбомов
│   │   ├── soundcloud.py            # Провайдер SoundCloud (yt-dlp scsearch)
│   │   └── youtube_web.py           # Провайдер обычного YouTube (yt-dlp ytsearch)
│   ├── services/
│   │   ├── factory.py               # Сборка графа зависимостей build_music_service()
│   │   ├── music_service.py         # Фасад MusicService с TTL-кэшированием
│   │   ├── provider_manager.py      # Параллельный опрос провайдеров, дедупликация, фоллбэк
│   │   ├── matcher.py               # Алгоритм ранжирования треков (score_track, clean_text)
│   │   ├── mood_mix.py              # Генератор миксов по настроению
│   │   ├── energy.py                # Ffmpeg PCM-анализатор аудио-энергетики треков
│   │   ├── lyrics.py                # Поиск синхронных LRC и обычных текстов (LRCLIB + YTM)
│   │   ├── playlist_import.py       # Импорт плейлистов из Spotify, Яндекса, Apple, YouTube
│   │   ├── plus_store.py            # Хранилище подписок Нотка Плюс, промокодов и HMAC initData
│   │   ├── auth_store.py            # Сессии пользователей, коды подтверждения Telegram
│   │   └── events_store.py          # Движок сезонных ивентов (Хэллоуин), заданий и наград
│   └── utils/
│       ├── ids.py                   # Сборка и парсинг составных ID "source:source_id"
│       ├── logging.py               # Конфигурация логгера
│       └── remux.py                 # Дефрагментация MP4 (ffmpeg -movflags +faststart)
│
├── miniapp/                         # Фронтенд Telegram Mini App
│   ├── index.html                   # Разметка 21 экрана, нижнего дока и 14 модалок/шторок
│   ├── config.js                    # window.NOTKA_CONFIG (API_BASE)
│   ├── src/                         # Модульная JS-архитектура (все файлы < 465 строк)
│   │   ├── core/                    # Ядро: env, state, sync, analytics, dom
│   │   ├── player/                  # Плеер: engine, controls, lighting, lyrics, queue, loudness
│   │   ├── ui/                      # UI: navigation, modals, track_row, context_menu
│   │   ├── screens/                 # Экраны: home, search, library, playlists, profile, etc.
│   │   └── app.js                   # Бутстраппер и инициализация приложения
│   ├── styles/                      # Модульные стили дизайн-системы «Живой свет»
│   │   ├── base.css, controls.css, components.css, player.css, animations.css
│   │   ├── screens/ (main.css, special.css)
│   │   └── system/ (desktop.css, layout.css)
│   ├── atmosphere/                  # Модули атмосферы (shapes, themes_nature, themes_seasonal, core)
│   ├── shredder/                    # Модули шредера (physics, strips, drag, engine)
│   ├── prism.js                     # WebGL2-шейдер призматического света (window.Prism)
│   ├── pumpkin.js                   # Интерактивная SVG-тыква (window.PumpkinArt)
│   └── icons/                       # Иконки приложения
│
├── deploy/                          # Продакшен-деплой на Ubuntu VPS
│   ├── README.md                    # Руководство по настройке сервера
│   ├── setup.sh                     # Автоустановщик (Caddy, Node 20, Python, systemd)
│   └── push.sh                      # Деплой обновлений с локальной машины по SSH/SCP
│
└── tests/                           # Автоматизированное тестирование
    ├── test_api_routes.py           # Тесты эндпоинтов API FastAPI
    ├── test_itunes_provider.py      # Тесты модулей iTunes
    ├── test_youtube_provider.py     # Тесты модулей YouTube Music
    ├── test_models.py               # Тесты Pydantic-моделей
    ├── test_services.py             # Тесты сопоставления, сессий и подписок
    ├── test_utils.py                # Тесты утилит (ID, логирование)
    ├── events_store_test.py         # Модульные тесты движка ивентов и Плюса
    ├── serve_local.py               # Локальный тестовый сервер (:8099)
    ├── cdp.mjs                      # Клиент Chrome DevTools Protocol поверх WebSocket
    └── e2e.mjs                      # Сквозной E2E-прогон (38 проверок в headless Chromium)
```
