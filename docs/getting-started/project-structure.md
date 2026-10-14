# Карта текущей структуры проекта

[← Конфигурация](configuration.md) · [К оглавлению](../README.md) · [Индекс исходников](../../PROJECT_INDEX.md)

Над проектом работают **leksik и hackov / Егор / crxwov**. Роли, ветки и согласование общих компонентов описаны в [правилах сотрудничества](../operations/collaboration.md).

Ниже — проверенная структура текущего дерева, а не план будущей модульной переработки.

```text
notka/
├── AGENTS.MD, CLAUDE.md            # Общий контекст разработчиков, правила агентов/бренда
├── README.md, PROJECT_INDEX.md    # Вход в проект и маршрутизация по реальным исходникам
├── todo.md                        # Только незавершённые общие планы
├── already-work-leksik.md         # Текущая работа/занятость leksik
├── already-work-crxwov.md         # Текущая работа/занятость crxwov
├── PRODUCT.md, DESIGN.md          # Продуктовый и визуальный контракт
├── requirements.txt              # Python-зависимости
├── run_notka.py, start.bat        # Windows и временный Cloudflare URL
├── run_server.py                 # Production API + дочерний бот + фоновые проверки/копии
├── music_resolver/
│   ├── main.py, config.py         # Фабрика FastAPI и настройки
│   ├── models.py, errors.py       # Модели и ошибки
│   ├── api/routes.py             # Действующие HTTP-маршруты и аудиокэш
│   ├── providers/                # youtube_music.py, youtube_common.py,
│   │                             # itunes_catalog.py, soundcloud.py, youtube_web.py
│   ├── services/                 # Поиск, matching, sync/auth, Plus/events,
│   │                             # метрики, импорт, профили треков, предзагрузка
│   ├── cache/ttl.py              # Кэш в памяти процесса
│   └── utils/                    # IDs, logging, remux
├── miniapp/
│   ├── index.html, config.js     # Веб-оболочка и API_BASE
│   ├── app.js                    # Действующий монолитный JS-клиент
│   ├── styles.css, system.css    # Основные веб-стили
│   ├── plus.css, events.css      # Стили Плюса/событий
│   └── mix.js и скрипты эффектов # prism, atmosphere, shredder, pumpkin
├── android/app/src/main/
│   ├── java/space/notka/app/     # Java/WebView, JS bridge, MediaSession/service
│   └── assets/miniapp/           # Отдельная копия UI для APK с модульными src/styles
├── bot/                          # aiogram polling, конфигурация, ручная рассылка
├── admin/index.html              # Статистика; доступ защищает reverse proxy
├── deploy/                       # push.sh/setup.sh, отдельные relay/proxy инструменты
├── docs/                         # Общая документация, сотрудничество, инфраструктура
└── tests/                        # Реальные проверочные скрипты; см. PROJECT_INDEX
```

Локальные `.env`, `data/`, `cache/`, `venv/`, скриншоты и сборочные результаты не являются исходниками для публикации. `cache/shared` хранит опубликованные плейлисты и не покрывается лимитом аудиокэша; нельзя считать всю папку cache одинаково безопасной для удаления.

В текущем веб-клиенте нет активного `miniapp/src/`, а серверный API импортируется из `api/routes.py`. Каталоги `api/routes/`, `providers/youtube/` и `providers/itunes/`, если остались только с `__pycache__`, не описывают действующую архитектуру. Модульная структура Android assets не означает, что веб-сайт использует ту же копию.

Серверные пути, размеры и сетевые зависимости — в [инфраструктуре от 14.10.2026](../operations/infrastructure-2026-10-14.md). Показанный срез не заменяет проверку после будущего релиза.
