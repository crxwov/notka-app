# Аудио-движок плеера и состояние `localStorage`

[← Экраны и модалки](screens-and-modals.md) · [К оглавлению](../README.md) · [Далее: Дизайн и графические движки →](visual-engines.md)

---

## 1. Клиентский аудио-движок (`miniapp/app.js`)

Воспроизведение в `miniapp/app.js` построено поверх элемента `<audio id="audio" preload="auto" playsinline>` и включает несколько специальных механизмов для стабильной работы внутри мобильного Telegram WebView.

### Жизненный цикл запуска трека (`startTrackPlayback`)
1. При выборе трека сразу обновляются обложка, заголовки, динамическая палитра света (`extractPalette`) и состояние кнопок.
2. Клиент отправляет запрос `GET /prepare?source=...&id=...`, дожидаясь, пока сервер скачает и дефрагментирует аудиофайл в `cache/audio_v2/`.
3. Только после ответа `ready: true` в `audio.src` выставляется `/stream?source=...&id=...` и вызывается `audio.play()`.
4. Токен гонки `playRequestToken` гарантирует, что если пользователь быстро переключил несколько треков подряд, старые завершившиеся запросы `/prepare` не перебьют последний выбранный трек.

### Упреждающий прогрев (`prefetchNextTrack`)
Как только текущий трек начал воспроизводиться, клиент определяет следующий трек в очереди (`state.queue[state.queueIndex + 1]`) и в фоне вызывает для него `GET /prepare`. К моменту окончания текущей песни следующая уже лежит на диске сервера в faststart-формате и включается без паузы.

### Защита от сломанного `audio.duration` (`effectiveDuration`)
В мобильных WebView свойство `audio.duration` иногда возвращает `Infinity`, `NaN` или `10.0`. Функция `effectiveDuration()` комбинирует `audio.duration` с эталонным полем `state.currentTrack.duration` из метаданных трека, обеспечивая точную работу таймлайна и перемотки.

### Тактильный скраббинг по пластинке, CD и кассете (`bindDiscScratch`)
В полноэкранном плеере реализована физическая перемотка жестами по самому носителю:
- **Виниловая пластинка (`vinyl`) и CD-диск (`cd`)**: вращение диска пальцем по кругу отслеживается через угол `Math.atan2(y - cy, x - cx)`. Полный оборот ($2\pi$ радиан) перематывает песню на $\pm 20\text{ с}$ с тактильными щелчками `haptic("selection")`.
- **Аудиокассета (`cassette`)**: горизонтальный свайп пальцем по корпусу кассеты перематывает плёнку со скоростью $0.25\text{ с}$ на пиксель.

### Кроссфейд (`maybeTriggerCrossfade`) и MediaSession
- При включённом кроссфейде (`3`, `6` или `10 с`) на событии `timeupdate` громкость плавно снижается перед концом трека и мягко нарастает на следующем.
- Функция `updateMediaSession()` синхронизирует текущий трек, обложку и позицию с системным плеером iOS / Android / Windows (`navigator.mediaSession`), позволяя переключать и перематывать треки с экрана блокировки и наушников.

---

## 2. Схема клиентского состояния `localStorage` (`notka_state_v2`)

Всё пользовательское состояние хранится в `localStorage` под ключом `notka_state_v2` (функции `loadState()` и `saveState()` в `miniapp/app.js`):

```json
{
  "favorites": [],
  "playlists": {
    "pl_1728000000": {
      "name": "Ночной драйв",
      "emoji": "🔥",
      "cover": null,
      "tracks": [],
      "createdAt": 1728000000000,
      "sharedId": "u8f9a1b2c3d"
    }
  },
  "playlistFlags": {},
  "followedArtists": ["youtube_music:UC..."],
  "followedMeta": {},
  "recent": [],
  "fresh": [],
  "sharedImports": {},
  "accountName": "",
  "accountAvatar": "",
  "onboardingSeenV2": true,
  "settings": {
    "quality": "high",
    "crossfade": 0,
    "normalize": true,
    "autoplay": true,
    "playerTheme": "cover",
    "atmosphere": "none"
  },
  "listens": {
    "totalMs": 3600000,
    "totalCount": 24,
    "byDay": {
      "2026-10-12": { "ms": 1200000, "count": 8, "hours": { "22": 5 } }
    },
    "tracks": {}
  },
  "events": {
    "progress": {},
    "claimed": [],
    "unlockedCosmetics": []
  }
}
```

### Защита от переполнения `localStorage`
При каждом вызове `saveState()` история прослушиваний `state.listens` автоматически компактифицируется:
- В `listens.byDay` сохраняются только последние **100 дней**.
- В `listens.tracks` сохраняются только **топ-300 треков** по количеству прослушиваний.
- Если браузер всё же выбрасывает `QuotaExceededError`, `saveState()` автоматически очищает кэш `fresh` и подрезает `recent` до 20 записей.
