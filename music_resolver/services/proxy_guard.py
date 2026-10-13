"""Следит, жив ли прокси из .env, и переключает Нотку между прокси и прямым соединением.

Раньше прокси проверялся один раз при старте. Если он умирал позже (WARP потерял
связь с Cloudflare), все запросы к YouTube, SoundCloud и iTunes ждали по 15 секунд,
а поиск зависал. Теперь проверка идёт раз в минуту и сразу после того, как все
источники поиска подряд отказали (`nudge`).
"""
import threading
import urllib.error
import urllib.request
from typing import Callable

CHECK_EVERY = 60.0  # seconds between regular checks
PROBE_TIMEOUT = 5.0  # a live proxy answers in a second or two

# Settings field -> raw proxy address from .env (set by load_settings)
FIELDS = ("ytdlp_proxy", "itunes_proxy", "ytmusic_proxy")


def probe(value: str) -> bool:
    """A real request through the proxy, not just a port check: a proxy can
    accept the TCP connection and still refuse to forward anything."""
    url = value if "://" in value else f"http://{value}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": url, "https": url}))
    try:
        with opener.open("https://music.youtube.com/", timeout=PROBE_TIMEOUT) as resp:
            return resp.status < 500
    except urllib.error.HTTPError as exc:
        return exc.code < 500  # the proxy forwarded it; the site just answered oddly
    except Exception:
        return False


class ProxyGuard:
    def __init__(self) -> None:
        self._raw: dict[str, str] = {}
        self._settings = None
        self._alive: dict[str, bool] = {}
        self._wake = threading.Event()
        self._started = False
        self._lock = threading.Lock()
        # called as listener(proxy_address, alive) from the guard's thread
        self.listeners: list[Callable[[str, bool], None]] = []
        # called with the settings field name after it was switched
        self.on_switch: list[Callable[[str], None]] = []

    def register(self, settings, raw: dict[str, str], alive: dict[str, bool]) -> None:
        """Remember which proxies are configured and start watching them."""
        self._settings = settings
        self._raw = {field: value for field, value in raw.items() if value}
        self._alive = dict(alive)
        if not self._raw:
            return
        with self._lock:
            if self._started:
                return
            self._started = True
        threading.Thread(target=self._loop, name="proxy-guard", daemon=True).start()

    def nudge(self) -> None:
        """Everything just failed: check the proxy right now instead of in a minute."""
        self._wake.set()

    @property
    def status(self) -> dict[str, bool]:
        return dict(self._alive)

    def _loop(self) -> None:
        while True:
            self._wake.wait(CHECK_EVERY)
            self._wake.clear()
            try:
                self.check_once()
            except Exception as exc:  # the guard itself must never die
                print(f"proxy guard: {exc!r}", flush=True)

    def check_once(self) -> None:
        settings = self._settings
        if settings is None:
            return
        for address in sorted(set(self._raw.values())):
            ok = probe(address)
            previous = self._alive.get(address)
            self._alive[address] = ok
            if previous is not None and previous != ok:
                print(
                    ("Прокси снова отвечает — возвращаюсь на него." if ok else "Прокси перестал отвечать — иду напрямую."),
                    flush=True,
                )
                for listener in list(self.listeners):
                    try:
                        listener(address, ok)
                    except Exception as exc:
                        print(f"proxy guard listener: {exc!r}", flush=True)
            for field, raw in self._raw.items():
                if raw != address:
                    continue
                wanted = raw if ok else None
                if getattr(settings, field) != wanted:
                    # Settings is frozen on purpose (nobody should edit it by
                    # accident); the guard is the one place allowed to.
                    object.__setattr__(settings, field, wanted)
                    for callback in list(self.on_switch):
                        try:
                            callback(field)
                        except Exception as exc:
                            print(f"proxy guard switch: {exc!r}", flush=True)


proxy_guard = ProxyGuard()
