# Current work — crxwov

participant: crxwov
agent: Antigravity
status: idle
updated_at_utc: 2026-11-09T13:00:18Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: webview2_desktop_app

## Objective / Success Criteria
ГОТОВО И ЗАКОММИЧЕНО:
1. Разработано нативное легковесное десктопное приложение для Windows в `desktop/` на базе .NET 10 + WebView2 (без Electron, нативная интеграция медиа-клавиш Windows SMTC и трея).
2. Реализована нативная авторизация через Telegram как на телефоне:
   - Включён встроенный экран входа (`setupLogin` / `login-modal` с жидким стеклянным логотипом и анимациями): флаг `window.notkaDesktop = true` активирует первый экран авторизации сразу после сплеша.
   - Пользователь вводит юзернейм в Telegram $\rightarrow$ бот `@notka_app_bot` отправляет 6-значный код $\rightarrow$ пользователь вводит код $\rightarrow$ сервер выдаёт сессионный токен.
   - Сессия сохраняется в `notka_session_v1` и `%LOCALAPPDATA%\Notka\session.json`.
   - Вся медиатека (любимые треки, плейлисты, подписки) автоматически подтягивается с сервера через `POST /sync` с заголовком `X-Telegram-Init-Data: notka-session:<token>`.
   - В профиле и шапке отображается реальное имя и фото/инициал пользователя, а кнопка «Войти через Telegram» переключается на «Выйти из аккаунта (Сейчас вошёл как @username)».
   - В `music_resolver/services/auth_store.py` добавлена поддержка распознавания `notka-session:<token>` в `resolve_user_id`.
3. Реализована автоматическая интеграция Discord Rich Presence (`desktop/Discord/DiscordRpcManager.cs`):
   - Прямое общение через локальный IPC-пайп `\\.\pipe\discord-ipc-0..9` без сторонних зависимостей.
   - В статусе пользователя в списке друзей отображается «Слушает <Имя артиста>» (например, «Слушает Yeat», «Слушает Miyagi & Эндшпиль»).
   - В развёрнутой карточке профиля:
     - Заголовок активности: Имя артиста
     - Первая строка: Название трека
     - Вторая строка: «в приложении Нотка» (или «Альбом • в Нотке»)
     - Живой прогресс-бар трека с таймером
     - Большая обложка альбома/трека + маленький круглый бейдж Нотки
     - Кликабельная кнопка «Слушать в Нотке».
   - Переключатель «Активность в Discord» в контекстном меню системного трея, сохранение настроек в `%LOCALAPPDATA%\Notka\discord.json`.
4. Установлен официальный круглый логотип Notka (`Assets/notka.ico`, `notka-512.png`).
5. Создан и проверен Windows MSI установщик `Notka-Setup.msi` (WiX v6, 49.39 МБ, self-contained single-file).
6. Тесты `tests/test_desktop.py` (5/5) пройдены успешно.

## Scope / Reservation
Нет активного резервирования (idle).

## Findings / Decisions
- Встроенный в веб-клиент `setupLogin` в `app.js` проверяет `isApp = !!(androidApp || window.notkaDesktop)`. При выставлении `window.notkaDesktop = true` и отсутствии `notka_session_v1` он автоматически открывает `#login-modal` после сплеша.
- `DiscordRpcManager` передаёт `name = displayArtist` при `type = 2`, что заставляет Discord рендерить заголовок «Слушает <Артист>», а детали трека и метку «в Нотке» выводить в раскрытой карточке.
