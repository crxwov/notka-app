#!/usr/bin/env bash
# One-shot install of the Yandex relay on a fresh Ubuntu server with a Russian IP.
# Usage (on that server, as root):  bash yandex_relay_install.sh <main-server-ip>
# It prints the two lines to put into the main server's .env at the end.
set -euo pipefail

MAIN_IP="${1:?give the main server IP (the one that will call the relay)}"
PORT=8765
DIR=/opt/yandex-relay

mkdir -p "$DIR"
cp "$(dirname "$0")/yandex_relay.py" "$DIR/yandex_relay.py"
TOKEN="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
echo "$TOKEN" > "$DIR/token"
chmod 600 "$DIR/token"

cat > /etc/systemd/system/yandex-relay.service <<UNIT
[Unit]
Description=Yandex Music relay
After=network-online.target

[Service]
Environment=RELAY_TOKEN=$TOKEN
Environment=RELAY_PORT=$PORT
ExecStart=/usr/bin/python3 $DIR/yandex_relay.py
Restart=always
User=nobody

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now yandex-relay

# only the main server may knock on the port
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow from "$MAIN_IP" to any port "$PORT" proto tcp >/dev/null
  ufw --force enable >/dev/null
fi

IP="$(curl -s -m 8 https://api.ipify.org || hostname -I | awk '{print $1}')"
echo
echo "Relay is up. Put these two lines into /opt/notka/app/.env on the main server:"
echo "YANDEX_RELAY_URL=http://$IP:$PORT"
echo "YANDEX_RELAY_TOKEN=$TOKEN"
