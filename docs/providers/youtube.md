# Провайдеры YouTube Music, YouTube Web и `YoutubeCommon`

[← Параллельный поиск и скоринг](overview-and-scoring.md) · [К оглавлению](../README.md) · [Далее: iTunes и SoundCloud →](itunes-and-soundcloud.md)

---

## 1. `YoutubeMusicProvider` (`music_resolver/providers/youtube_music.py`)

Основной провайдер приложения (`name = "youtube_music"`), объединяющий каталожный API `ytmusicapi` и извлечение потоков через `YoutubeCommon`.

### Как устроен поиск (`search`)
- Для запросов длиннее 3 символов запускает параллельно **два** поиска в `ytmusicapi`:
  1. `ytmusic.search(query, filter="songs")` — официальные студийные треки с чистыми названиями, квадратными обложками альбомов и точными ссылками на карточку артиста (`quality_hint="ytm_song"`).
  2. `ytmusic.search(query, filter="videos")` — музыкальные видео, концертные записи, SoundCloud-рипы и неофициальные релизы (`quality_hint="ytm_video"`).
- Функция `_upscale_thumb(url)` автоматически заменяет параметры сжатия обложек Google (`=w60-h60-`, `=w120-h120-`) на высокое разрешение `=w544-h544-`.

### Каталог артистов и альбомов (`get_artist`, `get_album`, `search_artists`)
- `search_artists(query, limit)` — ищет профили исполнителей (`filter="artists"`) для блока «Артисты» в поиске.
- `get_album(album_id)` — загружает страницу альбома (`ytmusic.get_album(browseId)`), нормализует список треков и проставляет им обложку и название альбома.
- `get_artist(artist_id)`:
  1. Загружает профиль исполнителя из `ytmusic.get_artist(channelId)` и собирает `top_tracks`.
  2. Поскольку в YouTube Music секция альбомов часто неполная, параллельно (с таймаутом $8\text{ с}$) запрашивает дискографию у `ITunesCatalogProvider.albums_for_artist_name(name)`.
  3. Если iTunes вернул альбомы, использует их как основную витрину дискографии артиста, иначе откатывается на список альбомов/синглов из YouTube Music.

### Бесконечное радио (`get_radio`)
- Вызывает `ytmusic.get_watch_playlist(videoId=source_id, limit=limit, radio=True)`.
- Отфильтровывает исходный сид-трек и пользовательские перезаливы без нормальных метаданных, возвращая готовую очередь для «Моей волны» и автопродолжения.

---

## 2. `YoutubeCommon` (`music_resolver/providers/youtube_common.py`)

Низкоуровневая обёртка над `yt-dlp`, которую совместно используют `YoutubeMusicProvider`, `YoutubeWebProvider` и `ITunesCatalogProvider`.

### Ключевые особенности
- **Выбор аудиоформата**:
  ```text
  bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio/best
  ```
  Предпочитает контейнер M4A (AAC), обеспечивающий максимальную совместимость с iOS Safari WebView и Android WebView.
- **Фильтр нерелевантных видео (`is_bad_music_candidate`)**:
  Отбрасывает ролики длиннее 15 минут (`>900 с`) и видео со стоп-словами (`karaoke`, `караоке`, `минус`, `instrumental`, `live`, `concert`, `reaction`, `review`, `cover`, `кавер`, `tutorial`, `lesson`, `разбор`, `1 hour`, `10 hours`, `full album`), если этих слов не было в запросе пользователя.
- **Автовосстановление при сбое cookies**:
  Если `yt-dlp` с подключёнными cookies возвращает ошибку (например, сессия YouTube протухла), методы `extract_info()` и `download_to_file()` автоматически делают повторную попытку без cookies (`_fresh_opts(use_cookies=False)`).
- **Многопоточное скачивание (`download_to_file`)**:
  Выполняет прямую загрузку медиапотока на диск в выделенном пуле `ThreadPoolExecutor(max_workers=6)` для эндпоинта `/prepare`.

---

## 3. `YoutubeWebProvider` (`music_resolver/providers/youtube_web.py`)

Дополнительный провайдер (`name = "youtube"`), который ищет напрямую по обычному YouTube через `ytsearch{limit}:{query}` в `YoutubeCommon`. Страхует выдачу в случаях, когда редкий ремикс, кавер или локальный перезалив отсутствует в индексе YouTube Music.
