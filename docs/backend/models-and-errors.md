# Модели данных, идентификаторы и коды ошибок

[← Карта файлов](../getting-started/project-structure.md) · [К оглавлению](../README.md) · [Далее: Справочник HTTP API →](http-api.md)

---

## Составные идентификаторы (`music_resolver/utils/ids.py`)

Все треки, альбомы и артисты в API «Нотки» адресуются составным строковым идентификатором вида:

```text
{source}:{source_id}
```

Примеры:
- `youtube_music:dQw4w9WgXcQ` — трек из YouTube Music.
- `youtube_music:MPREb_abc123` — альбом из YouTube Music.
- `youtube_music:UCxyz789` — артист из YouTube Music.
- `itunes:1440857781` — трек или альбом из каталога Apple iTunes.
- `soundcloud:987654321` — трек из SoundCloud.
- `youtube:dQw4w9WgXcQ` — ролик из обычного YouTube.

В модуле `music_resolver/utils/ids.py`:
- `build_public_id(source, source_id)` — собирает строку `f"{source}:{source_id}"`.
- `parse_public_id(raw_id)` — валидирует наличие разделителя `:` и возвращает кортеж `(source, source_id)`. При некорректном формате выбрасывает `AppError(ErrorCode.INVALID_QUERY)`.

---

## Модели данных (`music_resolver/models.py`)

Все модели построены на `pydantic.BaseModel`:

### 1. `TrackCandidate` (внутренний кандидат провайдера)
Используется внутри `ProviderManager` и провайдеров при поиске и ранжировании:
- `source: str` — имя провайдера (`youtube_music`, `soundcloud`, `youtube`, `itunes`).
- `source_id: str` — внутренний ID у провайдера.
- `title: str`, `artist: str` — название и исполнитель.
- `duration: int | None` — длительность в секундах.
- `cover_url: str | None` — URL обложки.
- `source_url: str` — оригинальная веб-ссылка на страницу трека.
- `is_Playable: bool = True` — доступен ли поток.
- `quality_hint: str | None` — метка типа источника (например, `"ytm_song"` или `"ytm_video"`).
- `album_name: str | None`, `album_id: str | None`, `artist_id: str | None` — связи с альбомом и карточкой артиста.

### 2. `TrackInfo` (публичная карточка трека в ответах API)
Формируется методом `TrackInfo.from_candidate(candidate)`:
```json
{
  "id": "youtube_music:dQw4w9WgXcQ",
  "source": "youtube_music",
  "source_id": "dQw4w9WgXcQ",
  "title": "Группа крови",
  "artist": "КИНО",
  "duration": 285,
  "cover": "https://lh3.googleusercontent.com/...=w544-h544-...",
  "album_name": "Группа крови",
  "album_id": "youtube_music:MPREb_...",
  "artist_id": "youtube_music:UC..."
}
```

### 3. `PlaybackInfo` и `ResolvedTrack`
Описывают параметры аудиопотока после резолвинга:
- `status: str` (`"ready"`)
- `stream_url: str` — относительный URL `/stream?source=...&id=...` (или прямая апстрим-ссылка внутри `ResolvedTrack`)
- `expires_at: int | None` — Unix-время истечения прямой ссылки YouTube/SoundCloud
- `mime_type: str | None` (`"audio/mp4"`, `"audio/webm"`)
- `bitrate: int | None` (в кбит/с)
- `headers: dict[str, str]` — HTTP-заголовки, необходимые для скачивания потока с апстрима

### 4. `AlbumSummary`, `AlbumInfo` и `ArtistInfo`
- `AlbumSummary` — карточка альбома в карусели (`id`, `source`, `source_id`, `title`, `artist`, `year`, `cover`, `track_count`).
- `AlbumInfo` — наследует `AlbumSummary` и добавляет полный список треков `tracks: list[TrackInfo]`.
- `ArtistInfo` — карточка артиста (`id`, `source`, `source_id`, `name`, `avatar`, `subscribers`, `top_tracks: list[TrackInfo]`, `albums: list[AlbumSummary]`).

---

## Коды ошибок (`music_resolver/errors.py`)

Любая контролируемая ошибка в бэкенде выбрасывается как `AppError(code, message, details)` и перехватывается в `music_resolver/main.py` с возвратом единого JSON-формата:

```json
{
  "error": {
    "code": "TRACK_NOT_FOUND",
    "message": "Track was not found",
    "details": {}
  }
}
```

| Код (`ErrorCode`) | HTTP-статус | Когда возникает |
| :--- | :---: | :--- |
| `INVALID_QUERY` | `400` | Пустой запрос `q`, неверный составной ID, пустой список сидов в `/mood` или недействительный промокод в `/plus/redeem`. |
| `INVALID_SOURCE_URL` | `400` | Неподдерживаемая ссылка в `/import` или отсутствие `url` в `/stream` при пустом `id`. |
| `TRACK_NOT_FOUND` | `404` | Трек не найден у провайдера или общий плейлист `/shared/{id}` не существует. |
| `ALBUM_NOT_FOUND` | `404` | Альбом не найден у провайдера. |
| `ARTIST_NOT_FOUND` | `404` | Артист не найден у провайдера. |
| `RESOLVE_FAILED` | `502` | Не удалось извлечь аудиопоток через `yt-dlp` или скачать медиафайл с апстрима. |
| `PROVIDER_UNAVAILABLE` | `503` | Внешний провайдер недоступен или произошла внутренняя ошибка парсинга. |
| `TIMEOUT` | `504` | Провайдер не ответил за `PROVIDER_TIMEOUT_SECONDS` ($20\text{ с}$). |
