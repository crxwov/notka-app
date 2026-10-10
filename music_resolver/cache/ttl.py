import time
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass
class _Item(Generic[T]):
    value: T
    expires_at: float


class TTLCache(Generic[T]):
    def __init__(self, default_ttl: int, maxsize: int = 1024) -> None:
        self.default_ttl = default_ttl
        self.maxsize = maxsize
        self._items: dict[str, _Item[T]] = {}

    def get(self, key: str) -> T | None:
        item = self._items.get(key)
        if item is None:
            return None
        if item.expires_at <= time.time():
            self._items.pop(key, None)
            return None
        return item.value

    def set(self, key: str, value: T, ttl: int | None = None) -> None:
        if len(self._items) >= self.maxsize and key not in self._items:
            self._evict_one()
        expires_at = time.time() + max(1, ttl if ttl is not None else self.default_ttl)
        self._items[key] = _Item(value=value, expires_at=expires_at)

    def clear(self) -> None:
        self._items.clear()

    def _evict_one(self) -> None:
        now = time.time()
        expired = [key for key, item in self._items.items() if item.expires_at <= now]
        for key in expired:
            self._items.pop(key, None)
        if len(self._items) < self.maxsize:
            return
        oldest = min(self._items, key=lambda key: self._items[key].expires_at)
        self._items.pop(oldest, None)
