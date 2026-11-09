<p align="center">
  <img src="assets/logo.png" width="96" alt="Логотип Нотки">
</p>

<h1 align="center">Нотка</h1>

<p align="center">
  Музыкальный плеер для Android и Windows.<br>
  Войди через Telegram, чтобы открыть любимые треки и плейлисты.
</p>

<p align="center">
  <a href="https://github.com/crxwov/notka-app/releases/download/desktop-v1.2.7/notka.apk"><strong>Скачать для Android</strong></a>
  ·
  <a href="https://github.com/crxwov/notka-app/releases/download/desktop-v1.2.7/Notka-Setup-1.2.7.msi"><strong>Скачать для Windows</strong></a>
  ·
  <a href="https://notka.duckdns.org/app/">Открыть в браузере</a>
</p>

## Выбери свою платформу

| Платформа | Что умеет приложение |
| --- | --- |
| **Android** · APK | Воспроизведение с выключенным экраном, управление из шторки, кэш обложек и проверка обновлений в приложении. |
| **Windows** · MSI | Фоновое воспроизведение в трее, системные медиаклавиши и статус в Discord с названием трека и исполнителем. |

На странице последнего релиза есть список изменений и контрольные суммы SHA-256 установщиков. [GitHub Releases](https://github.com/crxwov/notka-app/releases/latest)

## Как устроена Нотка

Клиенты открывают общий веб-интерфейс в Android WebView и Microsoft Edge WebView2. Нативная часть отвечает за воспроизведение в фоне, управление музыкой из системы и интеграции платформы. Изменения веб-интерфейса доступны после загрузки актуальной страницы.

## Сборка из исходников

**Android** использует Java и Android SDK. Скрипт сборки создаёт APK в `android/build/dist/notka.apk`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File android/build.ps1
```

**Windows** использует .NET 10, WebView2 и WiX. Скрипт сборки создаёт MSI в `desktop/bin/msi/Notka-Setup.msi`. [Подробности сборки Windows](desktop/README.md)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build-msi.ps1
```

Исходники клиентов находятся в [android/](android/) и [desktop/](desktop/). Серверные изменения для загрузки аватаров Telegram хранятся в [server-patches/](server-patches/).

[Лицензия GPL-3.0](LICENSE)
