"""Проверка сторожа прокси: мёртвый прокси отключается, ожившая возвращается, поиск не висит дольше срока.

Запуск: venv\\Scripts\\python tests\\proxy_guard_test.py
"""
import asyncio
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from music_resolver.errors import AppError  # noqa: E402
from music_resolver.services import proxy_guard as pg  # noqa: E402
from music_resolver.services import provider_manager as pm  # noqa: E402


@dataclass(frozen=True)
class Fake:
    ytdlp_proxy: str | None
    itunes_proxy: str | None
    ytmusic_proxy: str | None


ADDR = "http://127.0.0.1:40001"
state = {"alive": True}
pg.probe = lambda value: state["alive"]  # the guard calls module-level probe

guard = pg.ProxyGuard()
settings = Fake(ADDR, ADDR, ADDR)
switched: list[str] = []
heard: list[tuple[str, bool]] = []
guard.on_switch.append(switched.append)
guard.listeners.append(lambda address, ok: heard.append((address, ok)))
guard._settings = settings
guard._raw = {"ytdlp_proxy": ADDR, "itunes_proxy": ADDR, "ytmusic_proxy": ADDR}
guard._alive = {ADDR: True}

# alive -> nothing changes
guard.check_once()
assert settings.ytdlp_proxy == ADDR and not switched and not heard

# dies -> all three go direct, listeners told once
state["alive"] = False
guard.check_once()
assert settings.ytdlp_proxy is None and settings.itunes_proxy is None and settings.ytmusic_proxy is None
assert sorted(switched) == ["itunes_proxy", "ytdlp_proxy", "ytmusic_proxy"]
assert heard == [(ADDR, False)]

# still dead -> no repeat notifications
guard.check_once()
assert heard == [(ADDR, False)]

# comes back -> proxy restored
state["alive"] = True
guard.check_once()
assert settings.ytdlp_proxy == ADDR and settings.ytmusic_proxy == ADDR
assert heard == [(ADDR, False), (ADDR, True)]
print("guard: ok")


# ---- search never waits longer than the deadline ----
class Slow:
    def __init__(self, name):
        self.name = name

    async def search(self, query, limit):
        await asyncio.sleep(60)


pm.SEARCH_DEADLINE = 3.0
manager = pm.ProviderManager([Slow("a"), Slow("b"), Slow("c"), Slow("d")], timeout=15.0)
began = time.perf_counter()
try:
    asyncio.run(manager.search("queen", 5))
    raise SystemExit("search should have failed")
except AppError:
    pass
spent = time.perf_counter() - began
assert spent < 5.0, spent
print(f"search deadline: ok ({spent:.1f}s)")
