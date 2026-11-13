# Server patches

`audio-direct-cache.patch` targets the backend tree at `/opt/notka/app`. Verify it against the current files, then apply it there with `patch --binary -p1`; the server sources use CRLF. Set `AUDIO_CACHE_MAX_MB=0` in the server `.env` to disable audio byte eviction; leave `STREAM_LIVE` off. The patch keeps existing partial-file and expired live-copy cleanup.

## Separate audio volume

Use a dedicated ext4 filesystem labelled `notka-audio` at `/opt/notka/app/cache/audio_v2`. Add `audio-cache.fstab` to `/etc/fstab` and install `notka-audio-cache.conf` as `/etc/systemd/system/notka.service.d/audio-cache.conf`. The service then requires the volume mount before starting, so cache writes cannot silently fall back to the root filesystem.
