"""Turns YouTube's fragmented ("DASH") m4a into an ordinary one.

YouTube serves m4a audio cut into ~10-second fragments (moof/mdat pairs).
A desktop browser plays that from a plain file without complaint, but some
embedded players — Telegram's WebView among them — play the first fragment
and then go silent. Rewriting the container (no re-encoding, the audio
itself is untouched) into a regular MP4 with its index at the front makes
the same file play everywhere and start faster.

ffmpeg comes from the ``imageio-ffmpeg`` package, so nothing has to be
installed on the machine by hand. Without it, files are left as they are.
"""

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger("notka.remux")

_ffmpeg: str | None = None
_ffmpeg_checked = False


def ffmpeg_exe() -> str | None:
    global _ffmpeg, _ffmpeg_checked
    if not _ffmpeg_checked:
        _ffmpeg_checked = True
        try:
            import imageio_ffmpeg

            _ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            logger.warning("ffmpeg is not available: audio stays in YouTube's fragmented form")
    return _ffmpeg


def is_fragmented_mp4(path: Path) -> bool:
    """True for an MP4 whose top-level boxes include a movie fragment."""
    try:
        with open(path, "rb") as fh:
            size = path.stat().st_size
            pos = 0
            for _ in range(12):  # ftyp, moov, sidx, then the first moof
                fh.seek(pos)
                header = fh.read(16)
                if len(header) < 8:
                    return False
                box_size = int.from_bytes(header[:4], "big")
                box_type = header[4:8]
                if pos == 0 and box_type != b"ftyp":
                    return False  # not an MP4 at all (webm, mp3)
                if box_type == b"moof":
                    return True
                if box_type == b"mdat":
                    return False
                if box_size == 1:
                    box_size = int.from_bytes(header[8:16], "big")
                if box_size < 8:
                    return False
                pos += box_size
                if pos >= size:
                    return False
    except OSError:
        pass
    return False


def defragment(path: Path) -> bool:
    """Rewrite a fragmented MP4 in place as a regular one. True if it was rewritten."""
    exe = ffmpeg_exe()
    if not exe or not is_fragmented_mp4(path):
        return False
    tmp = path.with_name(path.name + ".part-remux")
    try:
        done = subprocess.run(
            [exe, "-v", "error", "-y", "-i", str(path), "-vn", "-c", "copy", "-movflags", "+faststart", "-f", "mp4", str(tmp)],
            capture_output=True,
            timeout=120,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if done.returncode != 0 or not tmp.exists() or tmp.stat().st_size < path.stat().st_size * 0.5:
            logger.warning("Could not rewrite %s: %s", path.name, done.stderr.decode("utf-8", "replace")[:200])
            return False
        tmp.replace(path)
        return True
    except (OSError, subprocess.SubprocessError):
        logger.exception("Could not rewrite %s", path.name)
        return False
    finally:
        tmp.unlink(missing_ok=True)


def defragment_all(directory: Path) -> int:
    """One pass over the audio already on disk (tracks cached before this fix)."""
    count = 0
    for path in directory.glob("*.bin"):
        if defragment(path):
            count += 1
    if count:
        logger.info("Rewrote %d cached tracks into regular MP4", count)
    return count
