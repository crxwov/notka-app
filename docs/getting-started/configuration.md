# Конфигурация и переменные окружения (`.env`)

[← Обзор архитектуры](overview.md) · [К оглавлению](../README.md) · [Далее: Карта файлов →](project-structure.md)

---

Настройки считываются из файла `.env` в корне проекта двумя модулями:
- `music_resolver/config.py` (`Settings` / `get_settings()`) — настройки бэкенда и провайдеров.
- `bot/config.py` (`BotSettings` / `get_bot_settings()`) — настройки Telegram-бота.

## Таблица переменных окружения

### Основные параметры и Telegram
| Переменная | По умолчанию | Описание |
| :--- | :--- | :--- |
| `BOT_TOKEN` | *(обязательна)* | Токен бота от `@BotFather`. Используется ботом, а также бэкендом для проверки HMAC-подписи `X-Telegram-Init-Data` и запроса `getMe` в `/bot-info`. |
| `ADMIN_IDS` | `""` | Список Telegram ID администраторов через запятую или пробел (например, `123456789,987654321`). Открывает доступ к команде `/promo`. |
| `PUBLIC_URL` | `http://localhost:8080` | Публичный HTTPS-адрес сервера в продакшене (например, `https://music.example.com`). |
| `MINIAPP_URL` | авто | Полный URL мини-приложения (`${PUBLIC_URL}/app/`). Выставляется автоматически в `run_notka.py` и `run_server.py`. |
| `RUN_BOT` | `1` | При значении `0`, `false` или `no` скрипт `run_server.py` запускает только HTTP API без процесса бота. |
| `HOST` | `127.0.0.1` | Хост привязки `uvicorn`. |
| `PORT` | `8080` | Порт HTTP-сервера. |
| `LOG_LEVEL` | `INFO` | Уровень логирования (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |

### Поиск, кэширование и лимиты
| Переменная | По умолчанию | Описание |
| :--- | :--- | :--- |
| `SEARCH_DEFAULT_LIMIT` | `5` | Количество треков в выдаче `/search` по умолчанию. |
| `SEARCH_MAX_LIMIT` | `20` | Максимально допустимый параметр `limit` в `/search`. |
| `SEARCH_CANDIDATES_PER_PROVIDER` | `5` | Сколько кандидатов запрашивать у каждого провайдера при поиске. |
| `PROVIDER_TIMEOUT_SECONDS` | `20.0` | Таймаут ожидания ответа от внешнего провайдера (в секундах). |
| `SEARCH_CACHE_TTL_SECONDS` | `300` | Время жизни in-memory кэша поисковой выдачи (5 минут). |
| `RESOLVE_CACHE_TTL_SECONDS` | `900` | Время жизни in-memory кэша резолвинга треков (15 минут). |
| `CACHE_MAX_ITEMS` | `512` | Максимальное число записей в in-memory `TTLCache`. |
| `AUDIO_CACHE_MAX_MB` | `2048` | Лимит размера дискового кэша аудиофайлов в `cache/audio_v2/` (в МБ). Старые файлы удаляются по LRU. |
| `STREAM_CHUNK_SIZE` | `65536` | Размер чанка потоковой отдачи (64 КБ). |

### Прокси и авторизация YouTube (`yt-dlp`)
| Переменная | По умолчанию | Описание |
| :--- | :--- | :--- |
| `YTDLP_PROXY` | `None` | HTTP/SOCKS прокси для `yt-dlp` (например, `http://127.0.0.1:10808` или `socks5://...`). |
| `ITUNES_PROXY` | `=YTDLP_PROXY` | Прокси для `ITunesCatalogProvider` (по умолчанию берёт `YTDLP_PROXY`). |
| `YTMUSIC_PROXY` | `=YTDLP_PROXY` | Прокси для `ytmusicapi` (по умолчанию берёт `YTDLP_PROXY`). |
| `YTDLP_COOKIES_FILE` | `None` | Абсолютный путь к файлу `cookies.txt` (формат Netscape) для обхода антибот-защиты YouTube на VPS. |
| `YTDLP_COOKIES_FROM_BROWSER` | `None` (`chrome` в `run_notka.py`) | Браузер (`chrome`, `edge`, `firefox`), из которого `yt-dlp` берёт куки на локальной машине. |

### Тестовые и отладочные переменные
| Переменная | По умолчанию | Описание |
| :--- | :--- | :--- |
| `NOTKA_ALLOW_UNVERIFIED` | `0` | Если `1`, разрешает передавать `X-Telegram-User-Id` без криптографической подписи `initData` (только для локальной отладки). |
| `NOTKA_TEST_USER` | `""` | Подменяет `user_id` в эндпоинтах `/events*` для E2E-тестов. |
| `NOTKA_FAKE_NOW` | `""` | Фиксирует текущую дату `YYYY-MM-DD` в движке сезонных ивентов (`events_store.py`). |
| `NOTKA_EVENTS_DIR` | `data/` | Директория хранения `events.json`. |
| `NOTKA_PLUS_DIR` | `data/` | Директория хранения `plus.json`. |

---

## Автопроверка живости прокси (`_usable_proxy`)

В `music_resolver/config.py` функция `_usable_proxy(url)` проверяет каждый сконфигурированный прокси один раз при старте сервера:
- Выполняется пробный запрос к `https://music.youtube.com/` с таймаутом $8\text{ с}$ (с резервной проверкой через системный `curl -x`).
- Если прокси не отвечает (например, локальный прокси-клиент закрыт), сервер логирует `WARNING: Configured proxy ... is unreachable; disabling proxy` и продолжает работу напрямую без прокси.
