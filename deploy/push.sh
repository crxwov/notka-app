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

HOST="${1:?Укажи адрес сервера: bash deploy/push.sh 5.227.61.107}"
USER_NAME="${NOTKA_SSH_USER:-egor}"
if [ "$HOST" = "94.156.179.229" ]; then
  DEFAULT_PORT=5463
  USER_NAME="${NOTKA_SSH_USER:-root}"
else
  DEFAULT_PORT=6767
fi
PORT="${NOTKA_SSH_PORT:-$DEFAULT_PORT}"

KEY="${NOTKA_SSH_KEY:-}"
if [ -z "$KEY" ]; then
  if [ -f "$HOME/.ssh/notka_deploy" ]; then
    KEY="$HOME/.ssh/notka_deploy"
  elif [ -f "$HOME/.ssh/id_ed25519" ]; then
    KEY="$HOME/.ssh/id_ed25519"
  fi
fi

SSH_OPTS=(-p "$PORT" -o StrictHostKeyChecking=accept-new)
if [ -n "$KEY" ]; then
  SSH_OPTS+=(-i "$KEY")
fi
SSH=(ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST")

cd "$(dirname "$0")/.."

# Защита от случайной перезаписи: на сервере записано, из какой ветки и кем выложено в прошлый раз.
# Если сейчас выкладывается ДРУГАЯ ветка, скрипт останавливается (обойти: NOTKA_FORCE=1 bash deploy/push.sh ...).
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
WHO="${NOTKA_DEPLOYER:-$(git config user.name || echo unknown)}@$(hostname)"
LAST="$("${SSH[@]}" "sudo cat /opt/notka/DEPLOY_INFO 2>/dev/null || cat /opt/notka/DEPLOY_INFO 2>/dev/null || true")"
LAST_BRANCH="$(printf '%s' "$LAST" | sed -n 's/^branch=//p' | head -1)"
if [ -n "$LAST_BRANCH" ] && [ "$LAST_BRANCH" != "$BRANCH" ] && [ "${NOTKA_FORCE:-0}" != "1" ]; then
  echo "СТОП: в прошлый раз на сервер выкладывали ветку «$LAST_BRANCH», а сейчас «$BRANCH»."
  printf '%s
' "$LAST"
  echo "Чтобы не затереть чужую работу, договоритесь, кто выкладывает. Если это точно нужно: NOTKA_FORCE=1 bash deploy/push.sh $HOST"
  exit 2
fi

echo "Отправляю код от имени $USER_NAME..."
git archive --format=tar HEAD | "${SSH[@]}" "sudo mkdir -p /opt/notka/app && sudo tar -x -C /opt/notka/app && sudo chown -R notka:notka /opt/notka/app"

echo "Ставлю зависимости и перезапускаю..."
# the install step is long and has been cut by the connection before: it is tried again, then the
# restart alone (the code is already there) so the new version never stays unstarted
"${SSH[@]}" "sudo -u notka /opt/notka/venv/bin/pip install -q --upgrade pip && sudo -u notka /opt/notka/venv/bin/pip install -q -r /opt/notka/app/requirements.txt && sudo -u notka /opt/notka/venv/bin/pip install -q --upgrade yt-dlp ytmusicapi" \
  || { echo "Связь оборвалась, повторяю установку..."; sleep 5; "${SSH[@]}" "sudo -u notka /opt/notka/venv/bin/pip install -q -r /opt/notka/app/requirements.txt" || echo "Установка не подтвердилась, перезапускаю с тем, что есть."; }
for attempt in 1 2 3; do
  "${SSH[@]}" "sudo systemctl restart notka && sleep 4 && sudo systemctl is-active notka && curl -s http://127.0.0.1:8080/health" && break
  echo "Перезапуск не подтвердился (попытка $attempt), пробую ещё раз..."; sleep 6
done
"${SSH[@]}" "sudo sh -c 'printf \"branch=%s\\ncommit=%s\\nby=%s\\nat=%s\\n\" \"$BRANCH\" \"$(git rev-parse --short HEAD)\" \"$WHO\" \"$(date \"+%Y-%m-%d %H:%M\")\" > /opt/notka/DEPLOY_INFO'"
echo
echo "Готово. На сервере записано: ветка $BRANCH, коммит $(git rev-parse --short HEAD), выложил $USER_NAME."

