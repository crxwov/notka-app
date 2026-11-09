# Current work — crxwov

participant: crxwov
agent: Antigravity
status: idle
updated_at_utc: 2026-11-09T11:37:52Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: webview2_desktop_app

## Objective / Success Criteria
ГОТОВО И ЗАКОММИЧЕНО (`65d0c1d` на ветке `webview2_desktop_app`):
Разработано нативное легковесное десктопное приложение для Windows в `desktop/` на базе .NET 10 + WebView2:
- Минимальное потребление памяти: ~30-50 МБ RAM (при сворачивании вызывается агрессивный trim рабочего набора памяти `SetProcessWorkingSetSize`). Без Electron, размер сборки исполняемого файла `Notka.exe` — всего 187 КБ.
- Нативная интеграция Windows SMTC (`SystemMediaTransportControls`): оверлей громкости, экран блокировки, передача названия трека, артиста, альбома, обложки и временной шкалы (timeline scrub), обработка аппаратных медиа-клавиш и кнопок гарнитур (Play/Pause, Next, Previous, Stop).
- Интеграция с системным треем (`NotifyIcon`): брендовая иконка Notka, тёмное контекстное меню с контролем воспроизведения и статусом трека, сворачивание в трей при закрытии (музыка не прерывается).
- Двусторонний JS-мост (`desktop/Bridge/notka-bridge.js`): перехват `navigator.mediaSession` и HTML5 Audio, отправка в C# через `window.chrome.webview.postMessage`, приём команд управления через `window.notkaMedia(action)`.
- Скрипт сборки `desktop/build.ps1` и автоматические тесты `tests/test_desktop.py` (все проверки зелёные).

## Scope / Reservation
Нет активного резервирования (idle).

## Findings / Decisions
- .NET 10 SDK 10.0.401 в `D:\DeyttConnectBuild\dotnet`.
- SMTC получен через `ISystemMediaTransportControlsInterop.GetForWindow(HWND)` с `af86e2e0-b12d-4c6a-9c5a-d7aa65101e90` (`IInspectable`).
- Защита от дубликатов процессов через именованный Mutex + EventWaitHandle: повторный запуск активирует работающее окно Notka.
