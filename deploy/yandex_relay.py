"""A tiny relay for Yandex Music, to run on a server with a Russian IP.

Yandex does not answer foreign addresses, so the main server (Germany) asks
this one instead. It forwards only the three public read-only calls the
playlist import needs, and only with the shared secret in `X-Relay-Token`.

    RELAY_TOKEN=... RELAY_PORT=8765 python3 yandex_relay.py

Standard library only: nothing to install.
"""

import hmac
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("RELAY_TOKEN", "")
PORT = int(os.environ.get("RELAY_PORT", "8765"))
UPSTREAM = "https://api.music.yandex.net/"
ALLOWED = re.compile(
    r"^(users/[A-Za-z0-9._@-]+/playlists/\d+"
    r"|playlist/[A-Za-z0-9.\-]+"
    r"|albums/\d+/with-tracks)$"
)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


class Relay(BaseHTTPRequestHandler):
    server_version = "relay"

    def _send(self, code: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        url = urllib.parse.urlparse(self.path)
        if url.path == "/health":
            return self._send(200, b'{"ok":true}')
        if not TOKEN or not hmac.compare_digest(self.headers.get("x-relay-token", ""), TOKEN):
            return self._send(403, b'{"error":"forbidden"}')
        path = url.path.lstrip("/")
        if not ALLOWED.match(path):
            return self._send(404, b'{"error":"not allowed"}')
        target = UPSTREAM + path + "?richTracks=true"
        req = urllib.request.Request(target, headers={"user-agent": UA, "accept-language": "ru,en;q=0.8"})
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return self._send(res.status, res.read())
        except urllib.error.HTTPError as exc:
            return self._send(exc.code, exc.read() or b"{}")
        except Exception:
            return self._send(502, b'{"error":"upstream"}')

    def log_message(self, *args) -> None:  # quiet
        pass


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("RELAY_TOKEN is not set")
    ThreadingHTTPServer(("0.0.0.0", PORT), Relay).serve_forever()
