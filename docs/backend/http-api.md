# Действующий HTTP API (`music_resolver/api/routes.py`)

[← Модели и ошибки](models-and-errors.md) · [К оглавлению](../README.md) · [Аудио и кэш →](audio-streaming.md)

Backend общий для двух разработчиков и двух клиентов. Изменения маршрутов, авторизации и форматов данных согласуются по [правилам сотрудничества](../operations/collaboration.md); Telegram frontend и Android assets проверяются отдельно.

Ниже — статический список регистрации маршрутов из текущего routes.py. API не перенесён в модульный пакет routes/. Точные параметры, Pydantic-модели, ограничения и коды ошибок нужно читать в соответствующем обработчике; список не заменяет спецификацию каждого запроса.

| Метод | Путь |
|---|---|
| GET, HEAD | `/inline/{source}/{source_id}.mp3` |
| GET | `/admin` |
| GET | `/admin/` |
| POST | `/admin/login` |
| POST | `/admin/logout` |
| GET | `/admin/api/summary` |
| POST | `/internal/metric` |
| GET | `/internal/summary` |
| GET | `/inline-thumb/{source}/{source_id}.jpg` |
| GET | `/inline-warm/{source}/{source_id}` |
| GET | `/health` |
| GET | `/search` |
| GET | `/artists` |
| POST | `/card` |
| GET | `/card/{name}` |
| POST | `/analytics` |
| GET | `/import` |
| POST | `/auth/request-code` |
| POST | `/auth/verify-code` |
| GET | `/auth/me` |
| POST | `/sync` |
| GET | `/plus/status` |
| POST | `/plus/redeem` |
| GET | `/events` |
| POST | `/events/sync` |
| POST | `/events/advance` |
| POST | `/events/reset` |
| GET | `/resolve` |
| GET | `/album` |
| GET | `/artist` |
| GET, HEAD | `/stream` |
| GET | `/radio` |
| GET | `/lyrics` |
| POST | `/mood` |
| GET | `/prepare` |
| GET | `/warm` |
| GET | `/credits` |
| POST | `/originals` |
| GET | `/profile` |
| GET | `/download` |
| GET | `/bot-info` |
| POST | `/shared` |
| GET | `/shared/{share_id}` |

## Основные контракты

- Поиск/каталог: `/search`, `/artists`, `/album`, `/artist`, `/resolve`, `/radio`, `/mood`. Воспроизведение каталога iTunes подбирает аудио в YouTube/SoundCloud.
- `/prepare` подготавливает локальный аудиофайл; `/warm` ограниченно прогревает кэш; `/stream` по умолчанию отдаёт локальный файл с Range. GET этих маршрутов может скачивать музыку/изменять кэш и не является чистой диагностикой.
- `/import` читает метаданные публичного плейлиста. Сам импорт не делает исходный сервис аудиопровайдером.
- `/auth/request-code`, `/auth/verify-code` — мобильный вход через код, доставляемый ботом. Название send-code из старой документации не является текущим путём.
- `/auth/me`, `/sync` поддерживают токен мобильной сессии и Telegram initData; `/plus/*`, `/events/*`, `/analytics` в текущем коде используют Telegram initData. Не предполагать поддержку мобильного токена у всех маршрутов.
- `/admin*` защищается reverse proxy Basic Auth; login/logout handlers не создают самостоятельную серверную сессию. Нельзя считать прямой доступ к backend защищённым тем же паролем.
- `/internal/*` — подписанный обмен с ботом, не публичная админка.
- `/shared` сохраняет опубликованный плейлист в cache/shared; текущая реализация не имеет общей квоты/TTL для этого хранилища.
- `/card` принимает созданные клиентом карточки с проверкой идентичности и ограничениями; `/analytics` записывает ограниченные продуктовые события.
- `/health` показывает доступность процесса API, но не работоспособность всех провайдеров, бота или воспроизведения.

Серверная топология, размеры/ограничения и границы live-проверки — в [отчёте об инфраструктуре](../operations/infrastructure-2026-10-14.md). Публичные docs/OpenAPI включаются только при ENABLE_DOCS=1 по текущему main.py; не открывать их в production по умолчанию ради чтения этой документации.
