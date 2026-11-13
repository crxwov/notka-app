# Server patches

`audio-direct-cache.patch` targets the backend tree at `/opt/notka/app`. Verify it against the current files, then apply it there with `patch --binary -p1`; the server sources use CRLF. Set `AUDIO_CACHE_MAX_MB=0` in the server `.env` to disable audio byte eviction; leave `STREAM_LIVE` off. The patch keeps existing partial-file and expired live-copy cleanup.
