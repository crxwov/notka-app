# Notka Client Apps (Android & Desktop)

Официальный репозиторий клиентских приложений для музыкального сервиса **Нотка** ([Notka](https://notka.duckdns.org)).

<p align="center">
  <img src="assets/logo.png" width="112" height="112" style="border-radius: 24px;" alt="Notka Logo" />
</p>

## Архитектура: Dynamic Hybrid Shell

Приложения **Нотка** построены по принципу **Dynamic Hybrid Shell**:
1. **Легковесный нативный контейнер**: Нативное приложение Android (Android WebView) и Windows Desktop (WebView2) занимает считанные килобайты памяти (APK всего ~70 КБ, старт за 0.3 секунды).
2. **Мгновенные обновления веб-интерфейса**: Приложение загружает актуальный веб-интерфейс напрямую с прода (`https://notka.duckdns.org/app/`). Любые изменения стилей, плеера, экранов и логики сразу же доступны пользователям без переустановки APK!
3. **Мгновенный кэш обложек (`CoverCache`)**: Встроенный нативный RAM (16 МБ) и дисковый кэш. Все обложки треков и альбомов кэшируются на лету. Повторная загрузка занимает 0 мс и работает офлайн без расхода трафика.
4. **Фоновое воспроизведение без прерываний**: Полноценный `MediaPlaybackService` с `MediaSession`, Android 14 `foregroundServiceType="mediaPlayback"`, `WakeLock`/`WifiLock` (музыка не засыпает при выключенном экране) и управление аудиофокусом при звонках.
5. **Авто-обновление и зеркало релизов в РФ**:
   - При старте приложение в фоне проверяет наличие обновлений на российском сервере (`https://notka.duckdns.org/app/version.json`) и GitHub.
   - При выходе новой версии показывает карточку со списком изменений (Splash Changelog) и кнопкой «Обновить».
   - Загружает APK в фоне с отображением прогресса и запускает установку в один клик.
6. **Единый ключ подписи (Unified Keystore)**:
   - Все релизы подписываются единым проектным ключом [`android/keystore/notka-release.keystore`](android/keystore/notka-release.keystore). При обновлении приложения подпись всегда совпадает.
7. **Никакого Electron на ПК**: Компьютерный клиент использует нативный Windows WebView2 (Chromium-движок Edge, встроенный в Windows 10/11), потребляя 30–50 МБ RAM.

---

## Структура репозитория

```
notka-app/
├── assets/                    # Официальные логотипы и медиа
├── android/                   # Мобильное приложение для Android
│   ├── app/src/main/
│   │   ├── java/space/notka/app/
│   │   │   ├── MainActivity.java           # WebView, Edge-to-Edge, insets, перехват обложек
│   │   │   ├── CoverCache.java             # Нативный RAM + дисковый кэш обложек
│   │   │   ├── MediaPlaybackService.java   # Фоновая служба, MediaSession, шторка, WakeLock
│   │   │   ├── AppUpdater.java             # Фоновая проверка обновлений, changelog, загрузка APK
│   │   │   ├── NotkaFileProvider.java      # Провайдер для безопасной установки обновлений
│   │   │   └── WebAppInterface.java        # Мост JavaScript <-> Android, вибро, URL
│   │   ├── assets/
│   │   │   └── offline.html                # Локальный экран отсутствия сети в стиле Living Light
│   │   └── res/                            # Официальная брендовая иконка "N", цвета, стили
│   ├── keystore/
│   │   └── notka-release.keystore          # Единый ключ подписи проекта
│   ├── tools/                              # Автономные утилиты сборки (aapt2, ecj, r8, signer)
│   ├── build.ps1                           # Скрипт мгновенной сборки и установки через ADB
│   ├── build.gradle.kts                    # Стандартная поддержка Gradle / Android Studio
│   └── settings.gradle.kts
├── desktop/                   # Компьютерное приложение (Windows Desktop)
└── README.md
```

---

## Сборка Android приложения

### Быстрая сборка через PowerShell (без Gradle, занимает ~5 секунд)

Скрипт `build.ps1` автономно компилирует ресурсы через `aapt2`, компилирует Java через `ecj`, переводит в DEX через `r8/d8` и подписывает релизным ключом:

```powershell
# Только собрать APK:
powershell -NoProfile -ExecutionPolicy Bypass -File android/build.ps1

# Собрать и автоматически установить на подключенный через ADB телефон:
powershell -NoProfile -ExecutionPolicy Bypass -File android/build.ps1 -Install
```

Готовый файл APK сохраняется в `android/build/dist/notka.apk`.

### Единая подпись APK (Unified Keystore)

Ключ подписи находится в репозитории:
- Путь: `android/keystore/notka-release.keystore`
- Alias: `notka`
- Пароль хранилища и ключа: `notka2026`
- Отпечаток SHA256: `7C:66:54:E9:77:29:63:40:DF:0A:08:3C:C3:5A:4C:62:BA:98:9B:74:89:A5:20:73:FF:4A:F2:1E:A2:82:17:A2`

---

## Правила публикации релизов

1. Сборка публикуется на GitHub Releases с тегом `v<версия>`.
2. Бинарник `notka.apk` и файл `version.json` загружаются на сервер в России (`ssh -p 6767 notka`) в директорию раздачи `/opt/notka/app/releases/`, чтобы пользователи в РФ скачивали обновления напрямую на высокой скорости без блокировок DPI.

## Лицензия

GPL v3. См. файл [LICENSE](LICENSE).
