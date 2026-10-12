#!/usr/bin/env bash
# Выкладывает текущую сохранённую версию Нотки на сервер и перезапускает её.
# Запускается с домашнего компьютера из папки проекта:
#
#     bash deploy/push.sh 203.0.113.10
#
# Уезжает то, что сохранено в истории проекта (последний коммит), — без
# кэша, venv и секретов. Файл .env на сервере создаётся один раз отдельно
# (deploy/README.md) и этим скриптом не трогается.
set -euo pipefail

HOST="${1:?Укажи адрес сервера: bash deploy/push.sh 203.0.113.10}"
KEY="${NOTKA_SSH_KEY:-$HOME/.ssh/notka_deploy}"
# the server's sshd listens on 5463 (the standard 22 is closed); NOTKA_SSH_PORT overrides
PORT="${NOTKA_SSH_PORT:-5463}"
SSH=(ssh -p "$PORT" -i "$KEY" -o StrictHostKeyChecking=accept-new "root@$HOST")

cd "$(dirname "$0")/.."

echo "Отправляю код..."
git archive --format=tar HEAD | "${SSH[@]}" "mkdir -p /opt/notka/app && tar -x -C /opt/notka/app && chown -R notka:notka /opt/notka/app"

echo "Ставлю зависимости и перезапускаю..."
"${SSH[@]}" "sudo -u notka /opt/notka/venv/bin/pip install -q --upgrade pip && sudo -u notka /opt/notka/venv/bin/pip install -q -r /opt/notka/app/requirements.txt && sudo -u notka /opt/notka/venv/bin/pip install -q --upgrade yt-dlp ytmusicapi && systemctl restart notka && sleep 4 && systemctl is-active notka && curl -s http://127.0.0.1:8080/health"
echo
echo "Готово."
