# Current work — crxwov

participant: crxwov
agent: Antigravity
status: idle
updated_at_utc: 2026-11-09T13:49:21Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: webview2_desktop_app

## Objective / Success Criteria
ГОТОВО И ЗАКОММИЧЕНО:
1. Разработано нативное легковесное десктопное приложение для Windows в `desktop/` на базе .NET 10 + WebView2 (без Electron, нативная интеграция медиа-клавиш Windows SMTC и трея).
2. Реализована нативная авторизация через Telegram как на телефоне:
   - В `desktop/Bridge/notka-bridge.js` внедрен модальный экран авторизации в темном фирменном стиле Нотки (`auth.css` / Android miniapp).
   - Шаг 1: ввод юзернейма `@username`, кнопка «Получить код в Telegram», кнопка «Открыть бота @notka_app_bot», кнопка «У меня уже есть код из бота», кнопка «Продолжить без входа» (гостевой режим).
   - Серверный запрос на `/auth/request-code` отправляет 6-значный код через бота `@notka_app_bot`.
   - Шаг 2: ввод 6-значного кода с автоподтверждением и запрос на `/auth/verify-code`.
   - Сессия сохраняется в `notka_auth_token`, `notka_auth_user`, `notka_session_v1`, в `%LOCALAPPDATA%\Notka\session.json` и `%LOCALAPPDATA%\Notka\auth.json`.
   - Подтягивание и синхронизация медиатеки с сервера (`data.sync` в `notka_state_v2`), автоматическая инициализация `window.Telegram.WebApp.initData = 'notka-session:<token>'` и `initDataUnsafe`.
   - Клик по аватару «Гость» в сайдбаре, профиле или шапке открывает окно авторизации.
3. Исправлен и проверен Discord Rich Presence:
   - Использован подтверждённый Discord Application ID `463097721130188830`.
   - Добавлены перехватчики конструктора `MediaMetadata` и `MediaSession.prototype.playbackState`, а также интервальный поллинг аудиоплеера в `notka-bridge.js`.
   - Добавлено корректное вычитывание ответных фреймов из IPC-пайпа Discord в `DiscordRpcManager.cs`.
   - `SET_ACTIVITY` с `type: 2` (Listening) выставляет «Слушает <Имя Артиста>», трек, альбом, таймлайн и кнопку.
4. Устранена блокировка старой версии (1.0.0):
   - Версия поднята до 1.1.0 (`desktop/NotkaDesktop.csproj`, `build-msi.ps1`, `Package.wxs`).
   - Исполняемый файл развернут в `%LOCALAPPDATA%\Programs\Notka\Notka.exe`, обновлены ярлыки на рабочем столе и в меню Пуск.
   - Собраны `desktop/bin/msi/Notka-Setup.msi` (49.4 МБ).

## Scope / Reservation
Нет активного резервирования (idle).

## Findings / Decisions
- Discord не отображает Rich Presence в нижнем левом углу возле кнопок микрофона/наушников (там только ник и Custom Status). Активность видна при клике на свой профиль (в карточке профиля), в списке участников сервера и в списке друзей.
- Запущенный процесс `Notka.exe` в `C:\Program Files` блокировал установку обновлений; ярлыки перенаправлены на пользовательский каталог `%LOCALAPPDATA%\Programs\Notka\Notka.exe`.
