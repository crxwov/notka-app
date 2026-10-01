#!/usr/bin/env bash
# Готовит чистый сервер Ubuntu (22.04 / 24.04) к работе Нотки. Запускается
# один раз от root:
#
#     bash setup.sh notka.example
#
# Что делает: ставит Python и Caddy, заводит пользователя notka, создаёт
# службу, которая держит Нотку запущенной (и поднимает её после перезагрузки),
# и настраивает https для домена. Сам код и .env кладёт deploy/push.sh.
set -euo pipefail

DOMAIN="${1:?Укажи домен: bash setup.sh notka.example}"
APP_DIR=/opt/notka

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-venv python3-pip curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

# Caddy: сам получает и продлевает https-сертификат для домена
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

id notka >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin notka
mkdir -p "$APP_DIR/app"
[ -d "$APP_DIR/venv" ] || python3 -m venv "$APP_DIR/venv"
chown -R notka:notka "$APP_DIR"

cat > /etc/systemd/system/notka.service <<EOF
[Unit]
Description=Notka (music backend, mini app and Telegram bot)
After=network-online.target
Wants=network-online.target

[Service]
User=notka
WorkingDirectory=$APP_DIR/app
ExecStart=$APP_DIR/venv/bin/python run_server.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8080
}
EOF

systemctl daemon-reload
systemctl enable notka >/dev/null
systemctl restart caddy

# только ssh и веб снаружи
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi

echo "Сервер готов. Теперь с домашнего компьютера: bash deploy/push.sh <адрес сервера>"
