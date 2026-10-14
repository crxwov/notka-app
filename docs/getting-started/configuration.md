# Конфигурация и переменные окружения

[← Обзор](overview.md) · [К оглавлению](../README.md) · [Карта проекта →](project-structure.md)

Общие настройки затрагивают работу обоих разработчиков и клиентов. Перед изменениями — [сотрудничество](../operations/collaboration.md); фактические настройки сервера и их ограничения — [инфраструктура](../operations/infrastructure-2026-10-14.md). Не копировать секреты в документы или Git.

`run_server.py` загружает `.env` из каталога приложения. Уже заданное окружение имеет приоритет при обычном load_dotenv. Имена/defaults ниже взяты из текущего кода; это не полный экспорт production `.env`.

| Переменная | Default / поведение |
|---|---|
| `BOT_TOKEN` | Нужен для бота, подписей Telegram и доставки кодов; секрет |
| `PUBLIC_URL` | Пусто; при включённом боте требуется HTTPS; адрес приложения формируется как PUBLIC_URL/app/ |
| `MINIAPP_URL` | Родитель задаёт дочернему боту полный URL |
| `ADMIN_IDS` | Список администраторов; не путать технический доступ бота с ролями двух разработчиков |
| `RUN_BOT` | `1`; в run_server отключает бота именно строка `0`, а не false/no |
| `PORT` | `8080`; production Uvicorn в run_server привязан к 127.0.0.1 |
| `LOG_LEVEL` | `INFO` для настройки logging; uvicorn запускается с warning |
| `ENABLE_DOCS` | `0`; docs/redoc/openapi включаются только строкой `1` |
| `PROVIDER_TIMEOUT` | `15.0` секунд |
| `CACHE_TTL` | `300` секунд поиска |
| `RESOLVE_CACHE_TTL` | `1800` секунд |
| `SEARCH_LIMIT` | `25` в Settings; конкретный query limit проверять в handler |
| `PROVIDER_ORDER` | youtube_music,soundcloud,youtube_web; factory добавляет iTunes |
| `DISABLED_PROVIDERS` | Пустой список |
| `STREAM_RESPONSE_MODE` | proxy; допустимы proxy/redirect/json |
| `AUDIO_CACHE_MAX_MB` | `40000`, умножается на 1024²; только аудиокэш, не весь диск |
| `DOWNLOAD_PARALLEL` | `2` по исходникам; в серверном срезе — 3 |
| `YTDLP_PROXY` | Пусто; прикладной прокси скачивания |
| `ITUNES_PROXY`, `YTMUSIC_PROXY` | Свой адрес либо YTDLP_PROXY |
| `YTMUSIC_LOCATION` | `US` |
| `YTDLP_FORCE_IPV6` | False по умолчанию |
| `YTDLP_COOKIE_FILE` | Путь к cookies; также проверяется data/youtube-cookies.txt, загруженный владельцем через бота |
| `YTDLP_COOKIES_FROM_BROWSER` | Пусто; локальный launcher может выбирать Chrome |
| `YANDEX_PROXY` | Отдельный прокси для импортов Яндекса; учётные данные — секрет |
| `NOTKA_DATA_DIR` | Корневая data/ для основных JSON-хранилищ |
| `NOTKA_EVENTS_DIR` | Переопределение каталога событий для изолированных тестов; не обычная production настройка |
| `NOTKA_TEST_USER` | Числовой тестовый fallback идентичности событий; нельзя включать для обычного production |
| `NOTKA_FAKE_NOW` | Тестовая подмена времени событий |
| `NOTKA_NO_PROFILING` | Любая непустая строка отключает profiling; значение `0` тоже непустое |
| `AUDIO_FEATURES_URL` | https://api.reccobeats.com/v1/analysis/audio-features |

Имена SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT, SEARCH_CANDIDATES_PER_PROVIDER, PROVIDER_TIMEOUT_SECONDS, SEARCH_CACHE_TTL_SECONDS, RESOLVE_CACHE_TTL_SECONDS, CACHE_MAX_ITEMS, NOTKA_ALLOW_UNVERIFIED и NOTKA_PLUS_DIR из прежней таблицы не являются описанием текущего Settings/основных хранилищ. HOST не меняет loopback-привязку в нынешнем run_server.py. Правильное имя пути cookies — YTDLP_COOKIE_FILE, в единственном числе.

## Проверка прокси

`_usable_proxy` вызывает `proxy_guard.probe`: HTTP-запрос к YouTube Music с таймаутом 5 секунд; дополнительного системного curl в этом пути нет. При отказе прикладной прокси отключается. ProxyGuard повторяет проверку примерно каждые 60 секунд и переключает настройки при восстановлении.

На сервере приложения «без прикладного прокси» не обязательно означает прямой внешний выход: системный TUN sing-box продолжает применять свои правила. В срезе 14.10.2026 YTDLP_PROXY/YTMUSIC_PROXY ссылались на неработающий порт 40001, но TUN и mixed proxy на 1080 отвечали; изменение этой схемы требует отдельной проверки зависимостей.
