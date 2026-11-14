# Current work — crxwov

participant: crxwov
agent: Codex
status: completed
updated_at_utc: 2026-11-14T00:16:45Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main

## Objective / Success Criteria
Move Notka's existing audio cache off the 97 GiB root filesystem and onto the spare 256 GiB disk, preserving cached files and keeping the service available after restart.

## Scope / Reservation
Canonical repository: https://github.com/crxwov/notka-app. Server: ssh notka. Dedicated ext4 filesystem on /dev/sdb mounted at /opt/notka/app/cache/audio_v2. Keep AUDIO_CACHE_MAX_MB=0 and STREAM_LIVE off. Preserve the old copy until data and service checks pass.

## Stages
1. Inspect disks, filesystems, mounts, and cache size — completed.
2. Prepare /dev/sdb and configure a persistent mount and systemd dependency — completed.
3. Copy and verify the existing cache, switch the mount, and restart the service — completed.
4. Verify cached and uncached playback, remove the old root copy, and record results — completed.

## Findings / Decisions
- /dev/sda is the 100 GiB OS disk; /dev/sda3 backs the 97 GiB root filesystem. /dev/sdb is a separate 256 GiB disk, initially unpartitioned and without recognized data or filesystem signatures.
- Formatted /dev/sdb as ext4 (label notka-audio, reserved blocks 0) and mounted it at the existing cache path. `/etc/fstab` uses the filesystem label; a systemd drop-in requires the mount before Notka starts, preventing silent fallback to the root disk.
- Runtime configuration remains AUDIO_CACHE_MAX_MB=0 and STREAM_LIVE off.
- Repository mount templates are in commit 656ab72 on main.
- After copy, final source inventory was 27,541 files / 41,997,457,708 bytes. All files copied during final sync were content-checked; both directory byte totals matched before switch.
- Removed the verified old root copy only after the new volume was mounted, service healthy, and a cold stream had completed background caching on /dev/sdb.

## Validation / Blockers
- `/dev/sdb` is mounted as ext4 at `/opt/notka/app/cache/audio_v2`; systemd `Requires` and `After` include the mount unit.
- `notka.service` is active; production `/health` returned HTTP 200 after migration.
- A migrated cached audio range returned HTTP 206. An uncached range streamed directly with HTTP 206, then its 21,731,581-byte `.bin` and MIME sidecar appeared on the new volume.
- Root usage fell from 57 GiB to 18 GiB; root now has 75 GiB free. The cache volume has about 212 GiB free.
- Service restart was verified; host reboot was not performed.
- No known blockers. The cache disk is a single volume without redundancy; cached audio can be regenerated if it fails.

## Next Action / Resume
Complete. Monitor available space on `/dev/sdb`; no code change or reboot is pending.