# Провайдеры iTunes Catalog и SoundCloud

[← Провайдеры YouTube](youtube.md) · [К оглавлению](../README.md) · [Далее: Миксы по настроению и энергия →](../services/mood-and-energy.md)

---

## 1. `ITunesCatalogProvider` (`music_resolver/providers/itunes_catalog.py`)

Провайдер каталога Apple Music / iTunes (`name = "itunes"`). Использует публичные эндпоинты `https://itunes.apple.com/search` и `https://itunes.apple.com/lookup` с регионом `country=RU`.

### Роль в архитектуре
1. **Витрина альбомов артиста (`albums_for_artist_name`)**:
   - Находит артиста в iTunes по имени (с проверкой схожести `fuzz.ratio >= 75`) и загружает до 50 его альбомов (`entity="album"`).
   - Отфильтровывает пустые синглы (`trackCount <= 1`), сортирует релизы от новых к старым и передаёт их в карточку артиста `YoutubeMusicProvider.get_artist()`.
   - Апскейлит обложки Apple до высокого разрешения (`100x100bb` $\rightarrow$ `600x600bb`).
2. **Просмотр альбомов (`get_album`)**:
   - Позволяет открыть любой альбом с префиксом `itunes:{collectionId}` и увидеть его точный треклист.

### 3-ступенчатый алгоритм матчинга аудио (`_match_audio`)
Поскольку сам iTunes API отдаёт только 30-секундные ознакомительные фрагменты, при запуске воспроизведения трека `itunes:{trackId}` метод `_match_audio(track)` автоматически находит полную аудиодорожку в YouTube в три прохода:

```mermaid
flowchart TD
    Start["Запрос воспроизведения itunes:{trackId}"] --> Cache{"Есть в _audio_match_cache?"}
    Cache -- Да --> Return["Возврат ResolvedTrack"]
    Cache -- Нет --> Pass1["Проход 1: YT Music search(filter='songs')"]
    Pass1 --> Check1{"score >= 55 и\nΔ длительности <= 12 с?"}
    Check1 -- Да --> Extract["Извлечение потока через YoutubeCommon"]
    Check1 -- Нет --> Pass2["Проход 2: YT Music search(filter='videos')"]
    Pass2 --> Check2{"score >= 45 и\nΔ длительности <= 20 с?"}
    Check2 -- Да --> Extract
    Check2 -- Нет --> Pass3["Проход 3: Общий YouTube ytsearch (yt-dlp)"]
    Pass3 --> Check3{"score >= 35?"}
    Check3 -- Да --> Extract
    Check3 -- Нет --> Fail["AppError(TRACK_NOT_FOUND)"]
    Extract --> SaveCache["Сохранение в _audio_match_cache"] --> Return
```

---

## 2. `SoundCloudProvider` (`music_resolver/providers/soundcloud.py`)

Провайдер поиска и воспроизведения из SoundCloud (`name = "soundcloud"`):
- **Поиск (`search`)**: выполняет быстрый плоский поиск `scsearch{limit}:{query}` через `yt-dlp` (`extract_flat=True`), собирая метаданные треков без лишних сетевых запросов к каждому потоку.
- **Резолвинг (`resolve_by_id` / `resolve_by_url`)**: извлекает прямую ссылку на аудиопоток (`mp3` / `opus`) со страницы трека на `soundcloud.com`, выбирая лучший аудиоформат по `abr`/`tbr`.
- Особенно полезен для поиска андеграундной электроники, фонка, диджей-сетов и независимых релизов, которых нет на YouTube.
