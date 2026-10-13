"""Background cache preloader for Notka.

Pre-caches audio files of all tracks in user playlists, favorites, and recent history
directly onto the server's local NVMe disk, so that user playback is instantaneous (<30ms)
without live streaming or relay delays from Apple Music / YouTube.

Prioritization:
1. User requests always take 100% priority (preloader immediately yields and pauses).
2. User favorites are preloaded first.
3. User recent history second.
4. User playlist tracks third.
5. New tracks added via /sync are queued automatically in real-time.
"""

from __future__ import annotations

import asyncio
import collections
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Awaitable, Callable

logger = logging.getLogger("notka.preloader")


class CachePreloader:
    def __init__(
        self,
        cache_dir: Path,
        data_dir: Path,
        download_fn: Callable[[str, str], Awaitable[tuple[Path, str]]],
        is_cached_fn: Callable[[str, str], bool],
    ) -> None:
        self.cache_dir = cache_dir
        self.data_dir = data_dir
        self.download_fn = download_fn
        self.is_cached_fn = is_cached_fn

        self.queue: collections.deque[tuple[str, str, str, str]] = collections.deque()
        self.queued_set: set[str] = set()
        self.failed_set: set[str] = set()

        self.total_playlist_tracks: int = 0
        self.cached_playlist_tracks: int = 0
        self.preloaded_in_session: int = 0

        self._user_active_until: float = 0.0
        self._running: bool = False
        self._worker_task: asyncio.Task | None = None
        self._periodic_scan_task: asyncio.Task | None = None

    def notify_user_playback(self, hold_seconds: float = 20.0) -> None:
        """Pause background caching while a user is actively requesting or streaming tracks."""
        self._user_active_until = max(self._user_active_until, time.time() + hold_seconds)

    def is_user_active(self) -> bool:
        return time.time() < self._user_active_until

    def enqueue_track(
        self,
        source: str,
        source_id: str,
        title: str = "",
        artist: str = "",
        priority: bool = False,
    ) -> bool:
        """Enqueue a single track for background caching if not already cached or queued."""
        if not source or not source_id:
            return False
        source = str(source).strip()
        source_id = str(source_id).strip()
        if not re.fullmatch(r"[a-z_]{3,20}", source):
            return False
        if not re.fullmatch(r"[A-Za-z0-9_.\-]{3,64}", source_id):
            return False

        key = f"{source}:{source_id}"
        if key in self.queued_set or key in self.failed_set:
            return False

        if self.is_cached_fn(source, source_id):
            return False

        self.queued_set.add(key)
        item = (source, source_id, title[:100], artist[:100])
        if priority:
            self.queue.appendleft(item)
        else:
            self.queue.append(item)
        return True

    def enqueue_from_sync_data(self, shared: dict) -> int:
        """Enqueue tracks from incoming sync data (favorites, playlists, recent)."""
        if not isinstance(shared, dict):
            return 0
        count = 0
        # Favorites (high priority)
        for t in shared.get("favorites", []):
            if isinstance(t, dict):
                src = t.get("source") or "itunes"
                sid = t.get("sourceId") or t.get("id")
                if sid and self.enqueue_track(src, str(sid), t.get("title", ""), t.get("artist", ""), priority=True):
                    count += 1

        # Recent tracks
        for t in shared.get("recent", []):
            if isinstance(t, dict):
                src = t.get("source") or "itunes"
                sid = t.get("sourceId") or t.get("id")
                if sid and self.enqueue_track(src, str(sid), t.get("title", ""), t.get("artist", ""), priority=False):
                    count += 1

        # Playlists
        for pl in shared.get("playlists", []):
            if isinstance(pl, dict):
                for t in pl.get("tracks", []):
                    if isinstance(t, dict):
                        src = t.get("source") or "itunes"
                        sid = t.get("sourceId") or t.get("id")
                        if sid and self.enqueue_track(src, str(sid), t.get("title", ""), t.get("artist", ""), priority=False):
                            count += 1
        return count

    def scan_all_user_data(self) -> tuple[int, int, int]:
        """Scan all data/sync/*.json files and populate the preloader queue."""
        sync_dir = self.data_dir / "sync"
        if not sync_dir.exists():
            return 0, 0, 0

        unique_favs: dict[str, tuple[str, str, str, str]] = {}
        unique_recents: dict[str, tuple[str, str, str, str]] = {}
        unique_playlist_tracks: dict[str, tuple[str, str, str, str]] = {}

        for fpath in sync_dir.glob("*.json"):
            try:
                raw = json.loads(fpath.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    continue
                shared = raw.get("shared", {})
                if not isinstance(shared, dict):
                    continue

                for t in shared.get("favorites", []):
                    if isinstance(t, dict):
                        src = t.get("source") or "itunes"
                        sid = str(t.get("sourceId") or t.get("id") or "").strip()
                        if src and sid:
                            unique_favs[f"{src}:{sid}"] = (src, sid, t.get("title", ""), t.get("artist", ""))

                for t in shared.get("recent", []):
                    if isinstance(t, dict):
                        src = t.get("source") or "itunes"
                        sid = str(t.get("sourceId") or t.get("id") or "").strip()
                        if src and sid:
                            unique_recents[f"{src}:{sid}"] = (src, sid, t.get("title", ""), t.get("artist", ""))

                for pl in shared.get("playlists", []):
                    if isinstance(pl, dict):
                        for t in pl.get("tracks", []):
                            if isinstance(t, dict):
                                src = t.get("source") or "itunes"
                                sid = str(t.get("sourceId") or t.get("id") or "").strip()
                                if src and sid:
                                    unique_playlist_tracks[f"{src}:{sid}"] = (src, sid, t.get("title", ""), t.get("artist", ""))
            except Exception:
                continue

        all_unique: dict[str, tuple[str, str, str, str]] = {}
        all_unique.update(unique_playlist_tracks)
        all_unique.update(unique_recents)
        all_unique.update(unique_favs)

        self.total_playlist_tracks = len(all_unique)
        cached_count = 0
        queued_count = 0

        # Enqueue favorites first (top priority)
        for key, (src, sid, title, artist) in unique_favs.items():
            if self.is_cached_fn(src, sid):
                cached_count += 1
            elif self.enqueue_track(src, sid, title, artist, priority=True):
                queued_count += 1

        # Then recents
        for key, (src, sid, title, artist) in unique_recents.items():
            if key not in unique_favs:
                if self.is_cached_fn(src, sid):
                    cached_count += 1
                elif self.enqueue_track(src, sid, title, artist, priority=False):
                    queued_count += 1

        # Then remaining playlist tracks
        for key, (src, sid, title, artist) in unique_playlist_tracks.items():
            if key not in unique_favs and key not in unique_recents:
                if self.is_cached_fn(src, sid):
                    cached_count += 1
                elif self.enqueue_track(src, sid, title, artist, priority=False):
                    queued_count += 1

        self.cached_playlist_tracks = cached_count
        print(f"[preloader] Synced playlist tracks: {cached_count}/{self.total_playlist_tracks} cached on disk, {queued_count} queued")
        return self.total_playlist_tracks, cached_count, queued_count

    async def _worker_loop(self) -> None:
        """Background loop that downloads queued tracks quietly without interfering with users."""
        # Warmup delay: let server settle down after boot
        await asyncio.sleep(8.0)
        try:
            await asyncio.to_thread(self.scan_all_user_data)
        except Exception as exc:
            print(f"[preloader] Initial scan failed: {exc}")

        while self._running:
            try:
                # 1. If user playback is active, yield and pause
                if self.is_user_active():
                    await asyncio.sleep(2.0)
                    continue

                # 2. If queue is empty, wait
                if not self.queue:
                    await asyncio.sleep(15.0)
                    continue

                # 3. Get next track
                src, sid, title, artist = self.queue.popleft()
                key = f"{src}:{sid}"

                # 4. Check if already cached (might have been played by user)
                if self.is_cached_fn(src, sid):
                    self.queued_set.discard(key)
                    self.cached_playlist_tracks += 1
                    continue

                # 5. Check user priority once more right before downloading
                if self.is_user_active():
                    self.queue.appendleft((src, sid, title, artist))
                    await asyncio.sleep(2.0)
                    continue

                # 6. Execute download
                try:
                    await asyncio.wait_for(self.download_fn(src, sid), timeout=180.0)
                    self.cached_playlist_tracks += 1
                    self.preloaded_in_session += 1
                    self.queued_set.discard(key)
                    print(f"[preloader] Cached track {src}:{sid} ({title[:30]}) [{self.cached_playlist_tracks}/{self.total_playlist_tracks}]")
                    # Polite sleep between downloads to keep CPU and network bandwidth calm
                    await asyncio.sleep(1.5)
                except Exception as exc:
                    self.failed_set.add(key)
                    self.queued_set.discard(key)
                    print(f"[preloader] Skip track {src}:{sid}: {exc}")
                    await asyncio.sleep(1.0)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                print(f"[preloader] Worker loop error: {exc}")
                await asyncio.sleep(5.0)

    async def _periodic_scan_loop(self) -> None:
        """Periodically re-scan sync directory every hour to catch newly imported playlists."""
        while self._running:
            try:
                await asyncio.sleep(3600.0)
                if self._running:
                    await asyncio.to_thread(self.scan_all_user_data)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(60.0)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())
        self._periodic_scan_task = asyncio.create_task(self._periodic_scan_loop())
        print("[preloader] Started background playlist audio preloader")

    def stop(self) -> None:
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
        if self._periodic_scan_task:
            self._periodic_scan_task.cancel()

    def status(self) -> dict:
        return {
            "running": self._running,
            "total_playlist_tracks": self.total_playlist_tracks,
            "cached_playlist_tracks": self.cached_playlist_tracks,
            "queue_size": len(self.queue),
            "preloaded_session": self.preloaded_in_session,
            "failed_count": len(self.failed_set),
            "user_active": self.is_user_active(),
        }
