# Караоке-тексты песен и импорт плейлистов

[← Миксы по настроению и энергия](mood-and-energy.md) · [К оглавлению](../README.md) · [Далее: Нотка Плюс и ивенты →](plus-and-events.md)

---

## 1. Сервис текстов песен (`music_resolver/services/lyrics.py`)

Эндпоинт `GET /lyrics` вызывает `fetch_lyrics(title, artist, duration, ytm, video_id)`.

### Порядок поиска текста
1. **Очистка метаданных (`_clean`)**:
   - Удаляет из названия и имени артиста шум вроде `(Official Music Video)`, `[HD]`, `prod. by ...`, `feat. ...`.
2. **Файловый кэш (`cache/lyrics/{sha1}.json`)**:
   - Найденные тексты кэшируются на диске бессрочно.
   - Отрицательные ответы (`found: false`) кэшируются на 24 часа, чтобы не спамить внешние API при повторном открытии трека.
3. **Основной источник — `LRCLIB` (`https://lrclib.net/api`)**:
   - Сначала запрашивает точное совпадение `/api/get?track_name=...&artist_name=...&duration=...` (проверяя, что разница длительности не превышает $3.0\text{ с}$).
   - Если точного попадания нет, выполняет поиск `/api/search` и выбирает лучшего кандидата через `_pick_best()` с приоритетом записей, содержащих синхронизированную разметку `syncedLyrics`.
   - Парсит LRC-строки вида `[01:24.50] Текст строки` регулярным выражением `_LRC_LINE_RE` в массив объектов `[{"time": 84.5, "text": "Текст строки"}]` для живой подсветки в плеере.
4. **Резервный источник — YouTube Music (`_from_ytmusic`)**:
   - Если в базе `LRCLIB` песни нет, запрашивает `ytmusic.get_watch_playlist(videoId)`, извлекает `lyrics` browseId и возвращает статический текст из `ytmusic.get_lyrics(browse_id)` (`synced: false`).

---

## 2. Импорт плейлистов по ссылке (`music_resolver/services/playlist_import.py`)

Эндпоинт `GET /import?url=...` позволяет перенести в «Нотку» любой публичный плейлист или альбом (до `MAX_TRACKS = 300` треков) без авторизации и ключей API.

### Поддерживаемые платформы

| Платформа | Примеры ссылок | Как извлекаются треки |
| :--- | :--- | :--- |
| **Spotify** | `open.spotify.com/playlist/...`<br>`open.spotify.com/album/...`<br>`open.spotify.com/track/...` | Загружает страницу виджета `https://open.spotify.com/embed/{kind}/{id}`, парсит JSON из `<script id="__NEXT_DATA__">` (`props.pageProps.state.data.entity.trackList`). При необходимости догружает полную публичную страницу. |
| **Яндекс Музыка** | `music.yandex.ru/users/.../playlists/...`<br>`music.yandex.ru/playlists/lk....`<br>`music.yandex.ru/album/...` | Обращается к публичным JSON-эндпоинтам `https://api.music.yandex.net/users/{owner}/playlists/{kind}`, `/playlist/{uuid}` или `/albums/{id}/with-tracks`. |
| **Apple Music** | `music.apple.com/{cc}/playlist/...`<br>`music.apple.com/{cc}/album/...` | Извлекает встроенный JSON `<script id="serialized-server-data">` со страницы Apple Music и рекурсивно собирает `trackLockup` / `MusicKit` элементы. Для альбомов имеет резервный фоллбэк на `itunes.apple.com/lookup?id=...&entity=song`. |
| **YouTube / YT Music** | `music.youtube.com/playlist?list=...`<br>`youtube.com/playlist?list=...` | Сначала запрашивает `ytmusicapi.get_playlist(list_id, limit=300)` (или `get_album_browse_id` для `OLAK5uy_...`), а при неудаче использует `yt-dlp --flat-playlist`. |

### Двухшаговый процесс на клиенте
1. Сервер за $1\text{–}2\text{ с}$ возвращает список метаданных (`title`, `artist`, `duration`, `cover`) всех треков плейлиста.
2. Фронтенд (`miniapp/app.js`) создаёт плейлист и в модальном окне с прогресс-баром параллельными пачками резолвит каждый трек через `/search`, сохраняя готовые `TrackInfo` в коллекцию пользователя.
