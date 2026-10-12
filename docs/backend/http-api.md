# Справочник HTTP API (`music_resolver/api/routes.py`)

[← Модели данных и ошибки](models-and-errors.md) · [К оглавлению](../README.md) · [Далее: Аудио-стриминг и кэш →](audio-streaming.md)

---

Все 20 HTTP-маршрутов приложения объявлены в `music_resolver/api/routes.py`.

## 1. Поиск и каталог

| Метод и маршрут | Query / Body параметры | Описание и ответ |
| :--- | :--- | :--- |
| `GET /health` | — | Возвращает `{"status": "ok"}`. |
| `GET /search` | `q` *(str, обяз.)*, `limit` *(int, по умолч. 5, макс. 20)* | Параллельный поиск треков по `youtube_music`, `soundcloud`, `youtube`. Возвращает `SearchResponse` (`{"query": q, "results": [TrackInfo, ...]}`). |
| `GET /artists` | `q` *(str, обяз.)*, `limit` *(int, по умолч. 8, макс. 20)* | Поиск карточек исполнителей в YouTube Music. Возвращает `{"query": q, "results": [{"id", "name", "avatar", "subscribers"}, ...]}`. |
| `GET /album` | `id` *(str, обяз.)*, `source` *(опц.)* | Возвращает `AlbumInfo` (метаданные альбома + массив `tracks`). Поддерживает источники `youtube_music` и `itunes`. |
| `GET /artist` | `id` *(str, обяз.)*, `source` *(опц.)* | Возвращает `ArtistInfo` (`name`, `avatar`, `subscribers`, `top_tracks`, `albums`). |

---

## 2. Резолвинг, подготовка и стриминг аудио

| Метод и маршрут | Параметры | Описание и ответ |
| :--- | :--- | :--- |
| `GET /resolve` | `id`, `source` *(опц.)*, `url` *(опц.)* | Находит аудиопоток трека и возвращает `ResolveResponse` (`track` + `playback` со ссылкой на `/stream`). |
| `GET /prepare` | `id` *(обяз.)*, `source` *(опц.)* | Скачивает трек на диск сервера в `cache/audio_v2/`, прогоняет через `ffmpeg -movflags +faststart` и возвращает `{"ready": true, "stream_url": "/stream?...", "size": ..., "mime_type": ...}`. |
| `GET /stream` | `id`, `source`, `url`, `mode` (`proxy` \| `redirect` \| `json`) | Отдаёт подготовленный аудиофайл через `FileResponse` с поддержкой `Range`-запросов (`Accept-Ranges: bytes`, `Cache-Control: no-store`). |
| `GET /download` | `id` *(обяз.)*, `source` *(опц.)* | Отдаёт аудиофайл как вложение (`Content-Disposition: attachment; filename*=UTF-8''Artist%20-%20Title.m4a`) для сохранения на устройство. |

---

## 3. Радио, миксы по настроению, тексты и импорт

### `GET /radio`
- **Параметры**: `id` *(обяз., сид-трек)*, `source` *(опц.)*, `limit` *(1..50, по умолч. 25)*.
- **Ответ**: `{"seed": "youtube_music:...", "results": [TrackInfo, ...]}` — бесконечная подборка похожих треков («Моя волна»).

### `POST /mood`
- **Тело запроса (`MoodRequest`)**:
  ```json
  {
    "mood": "energetic",
    "seeds": [{"id": "youtube_music:...", "artist": "КИНО", "title": "Группа крови"}],
    "top_artists": ["КИНО", "Молчат Дома"],
    "exclude_ids": [],
    "limit": 25
  }
  ```
- **Допустимые значения `mood`**: `"energetic"` (Бодрый), `"happy"` (Весёлый), `"calm"` (Спокойный), `"sad"` (Грустный).
- **Ответ**: `{"mood": "energetic", "results": [TrackInfo, ...]}`.

### `GET /lyrics`
- **Параметры**: `title` *(обяз.)*, `artist` *(опяз.)*, `duration` *(int, опц.)*, `source` *(опц.)*, `id` *(опц.)*.
- **Ответ**:
  ```json
  {
    "found": true,
    "source": "lrclib",
    "synced": true,
    "plain": "Полный текст...",
    "lines": [{"time": 12.45, "text": "Строка караоке"}]
  }
  ```

### `GET /import`
- **Параметры**: `url` *(публичная ссылка на плейлист или альбом Spotify, Яндекс Музыки, Apple Music или YouTube)*.
- **Ответ**: `{"source": "spotify", "title": "...", "cover": "...", "total": 42, "tracks": [{"title", "artist", "duration", "cover"}, ...]}`.

---

## 4. Подписка «Нотка Плюс», сезонные ивенты и шеринг

| Метод и маршрут | Заголовки / Тело | Описание и ответ |
| :--- | :--- | :--- |
| `GET /plus/status` | `X-Telegram-Init-Data` | Возвращает статус подписки пользователя: `{"active": bool, "until": int, "days_left": int, "source": str, "verified": bool}`. |
| `POST /plus/redeem` | `X-Telegram-Init-Data`<br>Body: `{"code": "PROMO"}` | Проверяет HMAC-подпись Telegram, применяет промокод (лимит 10 попыток/час на юзера) и начисляет дни Плюса. |
| `GET /events` | `X-Telegram-Init-Data` | Возвращает список сезонных ивентов, открытые по текущему дню задания, прогресс и разблокированную косметику (`unlocked_cosmetics`). |
| `POST /events/sync` | `X-Telegram-Init-Data`<br>Body: `{"event_id", "progress", "claimed"}` | Мержит прогресс клиента с сервером (`max`) и автоматически начисляет награды (включая дни Нотка Плюс). |
| `POST /events/advance` | `X-Telegram-Init-Data`<br>Body: `{"event_id", "task_id", "delta"}` | Увеличивает счётчик выполнения конкретного задания ивента. |
| `POST /events/reset` | `X-Telegram-Init-Data`<br>Body: `{"event_id"}` | Сбрасывает прогресс пользователя по ивенту и отзывает выданные за этот ивент дни Плюса. |
| `GET /bot-info` | — | Возвращает `{"username": "notka_music_bot"}` (кэширует ответ Telegram `getMe`) для генерации ссылок `https://t.me/<bot>?start=...`. |
| `POST /shared`<br>`GET /shared/{share_id}` | Body (`POST`): `{"name", "emoji", "cover", "owner", "tracks"}` | Сохраняет снимок пользовательского плейлиста в `cache/shared/{share_id}.json` и отдаёт его при открытии ссылки другом. |
