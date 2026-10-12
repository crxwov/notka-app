#!/usr/bin/env bash
# A second server as an exit to YouTube for the main Нотка server (when YouTube starts refusing
# the main server's address). Run it on the SECOND server, as root (Ubuntu/Debian):
#
#     bash second_server_proxy.sh 94.156.179.229 [port]
#
# 94.156.179.229 is the main server: only it may use this proxy. At the end the script prints
# the line to put into /opt/notka/app/.env on the main server (YTDLP_PROXY=...), then
# `systemctl restart notka` there. Nothing else on the second server is touched.
set -euo pipefail

MAIN_IP="${1:?give the main server's IP, the only address allowed to use the proxy}"
PORT="${2:-3128}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q tinyproxy

cat > /etc/tinyproxy/tinyproxy.conf <<CFG
User tinyproxy
Group tinyproxy
Port $PORT
Listen 0.0.0.0
Timeout 600
MaxClients 20
Allow $MAIN_IP
DisableViaHeader Yes
LogLevel Warning
CFG

systemctl enable --now tinyproxy >/dev/null 2>&1
systemctl restart tinyproxy

# only the main server may reach the port, in case this machine has a firewall tool at hand
if command -v ufw >/dev/null 2>&1; then
  ufw allow from "$MAIN_IP" to any port "$PORT" proto tcp >/dev/null || true
fi

IP="$(curl -s -m 8 https://api.ipify.org || hostname -I | awk '{print $1}')"
echo
echo "Proxy is up. On the MAIN server, in /opt/notka/app/.env set:"
echo "YTDLP_PROXY=http://$IP:$PORT"
echo "then: systemctl restart notka"
