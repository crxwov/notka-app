# Current work — crxwov

participant: crxwov
agent: Antigravity
status: idle
updated_at_utc: 2026-11-09T13:25:08Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: webview2_desktop_app

## Objective / Success Criteria
ГОТОВО И ЗАКОММИЧЕНО:
1. Разработано нативное легковесное десктопное приложение для Windows в `desktop/` на базе .NET 10 + WebView2 (без Electron, нативная интеграция медиа-клавиш Windows SMTC и трея).
2. Реализована нативная авторизация через Telegram как на телефоне:
   - В `desktop/Bridge/notka-bridge.js` внедрен полноценный модальный экран авторизации в фирменном темном стиле Нотки (`auth.css` / Android miniapp).
   - Шаг 1: ввод юзернейма `@username`, кнопка «Получить код в Telegram», кнопка «Открыть бота @notka_app_bot», кнопка «У меня уже есть код из бота», кнопка «Продолжить без входа» (гостевой режим).
   - Серверный запрос на `/auth/request-code` отправляет 6-значный код через бота `@notka_app_bot`.
   - Шаг 2: ввод 6-значного кода с автоподтверждением и запрос на `/auth/verify-code`.
   - Сессия сохраняется в `notka_auth_token`, `notka_auth_user`, `notka_session_v1`, в `%LOCALAPPDATA%\Notka\session.json` и `%LOCALAPPDATA%\Notka\auth.json`.
   - Подтягивание и синхронизация медиатеки с сервера (`data.sync` в `notka_state_v2`), автоматическая инициализация `window.Telegram.WebApp.initData = 'notka-session:<token>'` и `initDataUnsafe`.
   - Клик по аватару «Гость» в сайдбаре, профиле или шапке открывает окно авторизации.
3. Исправлен Discord Rich Presence (`desktop/Discord/DiscordRpcManager.cs`):
   - Заменен некорректный ID на проверенный рабочий Application ID `463097721130188830`.
   - Рукопожатие по IPC-пайпу `\\.\pipe\discord-ipc-0` успешно проходит с ответом `READY`.
   - `SET_ACTIVITY` с `type: 2` (Listening) отображает в статусе пользователя в Discord: «Слушает <Имя Артиста>» (например, «Слушает Yeat»).
   - При раскрытии карточки профиля:
     - Название песни в первой строке (`details`)
     - `<Альбом> • в Нотке` во второй строке (`state`)
     - Живой прогресс-бар трека (`timestamps: start, end`)
     - Обложка трека + круглый бейдж Нотки
     - Кнопка «Слушать в Нотке» (`https://notka.duckdns.org/app/`).
   - При паузе активность автоматически очищается.
4. Создан и проверен Windows MSI установщик `Notka-Setup.msi` (49.4 МБ).
5. Все тесты `tests/test_desktop.py` (5/5) пройдены успешно.

## Scope / Reservation
Нет активного резервирования (idle).

## Findings / Decisions
- Discord Developer Portal требует строго зарегистрированный Application ID при IPC рукопожатии; ID `463097721130188830` подтвержден и протестирован в живой сессии Discord.
- Веб-версия Нотки на `notka.duckdns.org/app/` не содержала `screen-auth` из Android-сборки; мост `notka-bridge.js` внедряет аутентификацию на клиенте и обеспечивает синхронизацию с сервером.
