# Деплой в продакшен на VPS (`deploy/`)

[← Дизайн и графические движки](../miniapp/visual-engines.md) · [К оглавлению](../README.md) · [Далее: Тестирование и нюансы →](testing-and-caveats.md)

---

Для развёртывания «Нотки» на чистом сервере **Ubuntu 22.04 / 24.04** с привязанным доменом используются скрипты из папки `deploy/`.

## 1. Первичная установка (`deploy/setup.sh`)

На сервере под `root` (или через `sudo`) выполняется одна команда:

```bash
DOMAIN=music.example.com BOT_TOKEN=123456:ABC... sudo -E bash deploy/setup.sh
```

### Что автоматически делает `setup.sh`
1. **Системные пакеты**: ставит `python3`, `python3-venv`, `ffmpeg`, `git`, `curl`, `ca-certificates`.
2. **Node.js 20**: устанавливает свежий Node.js из репозитория NodeSource (необходим `yt-dlp` для вычисления антибот JS-челленджей YouTube).
3. **Caddy**: устанавливает веб-сервер Caddy для автоматического получения и продления SSL-сертификатов Let's Encrypt.
4. **Пользователь и директории**: создаёт изолированного системного пользователя `notka`, копирует проект в `/opt/notka/app`, создаёт виртуальное окружение `/opt/notka/venv` и ставит зависимости из `requirements.txt` (плюс самый свежий `yt-dlp`).
5. **Генерация `.env`**: создаёт `/opt/notka/app/.env` с правами `600`:
   ```ini
   BOT_TOKEN=...
   PUBLIC_URL=https://music.example.com
   HOST=127.0.0.1
   PORT=8080
   LOG_LEVEL=INFO
   ```
6. **Systemd-сервис `/etc/systemd/system/notka.service`**:
   - Запускает `/opt/notka/venv/bin/python run_server.py` от имени пользователя `notka`.
   - Настроен на автоматический перезапуск при сбоях (`Restart=always`, `RestartSec=5`).
7. **Настройка `/etc/caddy/Caddyfile`**:
   ```caddyfile
   music.example.com {
       encode gzip
       reverse_proxy 127.0.0.1:8080
   }
   ```

---

## 2. Выкатка обновлений с рабочей машины (`deploy/push.sh`)

Чтобы быстро обновить код на боевом сервере без переустановки окружения:

```bash
bash deploy/push.sh root@<IP_СЕРВЕРА>
```

Скрипт `push.sh`:
1. Копирует по `scp` папки `bot/`, `music_resolver/`, `miniapp/`, а также `run_server.py` и `requirements.txt` в `/opt/notka/app/`.
2. По SSH обновляет зависимости в `/opt/notka/venv` и перезапускает сервис `systemctl restart notka`.

---

## 3. Полезные команды обслуживания на VPS

| Задача | Команда |
| :--- | :--- |
| Проверить статус сервиса | `systemctl status notka` |
| Смотреть живые логи сервера и бота | `journalctl -u notka -f` |
| Перезапустить сервис | `systemctl restart notka` |
| Обновить `yt-dlp` (если YouTube сменил алгоритмы) | `/opt/notka/venv/bin/pip install -U yt-dlp && systemctl restart notka` |
| Подключить `cookies.txt` для YouTube | Положить файл в `/opt/notka/cookies.txt`, добавить `YTDLP_COOKIES_FILE=/opt/notka/cookies.txt` в `/opt/notka/app/.env` и выполнить `systemctl restart notka`. |
