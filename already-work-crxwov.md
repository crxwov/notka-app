# Current work — crxwov

participant: crxwov
agent: Antigravity
status: idle
updated_at_utc: 2026-11-09T11:46:24Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: webview2_desktop_app

## Objective / Success Criteria
ГОТОВО И ЗАКОММИЧЕНО:
1. Разработано нативное легковесное десктопное приложение для Windows в `desktop/` на базе .NET 10 + WebView2 (без Electron, нативная интеграция медиа-клавиш Windows SMTC и трея).
2. Создан официальный Windows MSI установщик `Notka-Setup.msi` на базе WiX Toolset v6:
   - Проект инсталлятора: `desktop/installer/Notka.Installer.wixproj`, `Package.wxs`, `license.rtf`.
   - Скрипт сборки: `desktop/build-msi.ps1`.
   - Готовый пакет: `desktop/bin/msi/Notka-Setup.msi` (49.45 МБ, self-contained single-file payload, русская локализация, установка в `Program Files\Notka`, ярлыки в меню «Пуск» и на Рабочем столе).
   - Тесты: 5/5 тестов в `tests/test_desktop.py` успешно пройдены.

## Scope / Reservation
Нет активного резервирования (idle).

## Findings / Decisions
- WiX Toolset v6 (`WixToolset.Sdk/6.0.0`) выполняет компиляцию пакета через `Package.wxs` с кодовой страницей 1251 (`ru-RU`).
- MSI пакет содержит self-contained `Notka.exe` со встроенным рантаймом .NET 10, что гарантирует мгновенный запуск у любого пользователя Windows 10/11 без предварительной установки зависимостей.
