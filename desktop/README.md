# Notka Desktop (Windows)

Нативный легковесный клиент Notka для Windows на базе **.NET 10** и **Microsoft Edge WebView2**.

## Ключевые преимущества перед Electron

| Параметр | Notka Desktop (.NET 10 + WebView2) | Electron |
|---|---|---|
| **Потребление RAM** | **~30–50 МБ** (при сворачивании сжимается до ~20 МБ) | **~180–300 МБ** |
| **Размер исполняемого файла** | **~180 КБ** (`Notka.exe`) | **~90–150 МБ** |
| **Время холодного запуска** | **< 300 мс** | **~1.5–3.5 с** |
| **Медиа-клавиши и SMTC** | Нативная WinRT-интеграция `SystemMediaTransportControls` (кнопки гарнитур, клавиатур, оверлей звука Windows, экран блокировки) | Ограниченная Chromium-эмуляция |
| **Фоновое воспроизведение** | Не засыпает при сворачивании; не выгружает аудиотреки | Требует фоновых процессов и костылей |

---

## Архитектура решения

1. **Host (.NET 10 WinForms + WinRT Projection)**:
   - `Notka.Desktop.UI.MainForm`: основное окно приложения с поддержкой Windows 10/11 Dark Titlebar (`DwmSetWindowAttribute`), сохранением позиции и размера окна в `%LOCALAPPDATA%\Notka\window-settings.json`.
   - `Notka.Desktop.Smtc.SmtcManager` и `SmtcInterop`: подключение к системному оверлею Windows SMTC через интерфейс `ISystemMediaTransportControlsInterop`. Поддерживает команды Play, Pause, Next, Previous, Stop, отображение обложки трека, названия, артиста и синхронизацию шкалы времени.
   - `Notka.Desktop.Tray.TrayIconManager`: иконка в системном трее с брендовым логотипом Notka и тёмным контекстным меню («Воспроизведение/Пауза», «Следующий трек», «Предыдущий трек», «Развернуть Notka», «Выход»). При нажатии на крестик окно сворачивается в трей и продолжает проигрывать музыку.
   - Одноинстансный режим (`Mutex` + `EventWaitHandle`): повторный запуск приложения восстанавливает и фокусирует уже работающее окно вместо открытия дубликата.

2. **Двусторонний мост (`desktop/Bridge/notka-bridge.js`)**:
   - Автоматически инжектируется в WebView2 перед загрузкой страницы (`AddScriptToExecuteOnDocumentCreatedAsync`).
   - Перехватывает вызовы `navigator.mediaSession.metadata` и `navigator.mediaSession.playbackState`, передавая события в C# через `window.chrome.webview.postMessage`.
   - Слушает HTML5 `<audio>` события (`play`, `pause`, `ended`, `durationchange`) как надежный fallback.
   - Предоставляет глобальную функцию `window.notkaMedia(action)` для управления плеером по аппаратным клавишам и меню трея (вызывает `mediaSession` action handlers или кликает по элементам DOM).

---

## Сборка и запуск

### Требования
- Windows 10 (билд 19041+) или Windows 11.
- .NET 10 SDK (установлен в системе или в `D:\DeyttConnectBuild\dotnet`).
- Microsoft Edge WebView2 Runtime (входит в состав Windows 10/11 по умолчанию).

### Сборка установщика Windows (MSI):
```powershell
powershell -ExecutionPolicy Bypass -File desktop/build-msi.ps1
```
Готовый установщик сохраняется в `desktop/bin/msi/Notka-Setup.msi`. Установщик:
- Разворачивает приложение в `Program Files\Notka\`;
- Создаёт ярлыки в меню «Пуск» и на Рабочем столе с официальной иконкой Notka;
- Содержит self-contained сжатую сборку, не требующую отдельной установки .NET SDK у пользователя;
- Поддерживает тихую установку через `msiexec /i Notka-Setup.msi /qn` и корректное удаление.

### Быстрая сборка portable-версии:
```powershell
powershell -ExecutionPolicy Bypass -File desktop/build.ps1
```

Результат сборки помещается в `desktop/bin/publish/`.

### Запуск с кастомным адресом (например, локальный сервер разработки):
```powershell
.\desktop\bin\publish\Notka.exe http://localhost:8080/app/
```
По умолчанию приложение подключается к продакшену `https://notka.duckdns.org/app/?source=desktop`.
