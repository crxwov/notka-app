# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-13T23:45:34Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main

## Objective / Success Criteria
Move Notka's existing audio cache off the 97 GiB root filesystem and onto the spare 256 GiB disk, preserving all cached files and keeping the service available after restart/reboot.

## Scope / Reservation
Canonical repository: https://github.com/crxwov/notka-app. Server: ssh notka. Use the spare /dev/sdb as a dedicated ext4 filesystem mounted at /opt/notka/app/cache/audio_v2. Keep AUDIO_CACHE_MAX_MB=0 and STREAM_LIVE off. Copy and verify before switching; remove the old root copy only after the service and cache checks pass.

## Stages
1. Inspect disks, filesystems, mounts, and cache size — completed.
2. Prepare /dev/sdb and configure a persistent mount — active.
3. Copy the existing audio cache, verify it, switch the mount, and restart the service — pending.
4. Verify cold and cached requests, remove the old cache copy, and record results — pending.

## Findings / Decisions
- /dev/sda is the 100 GiB OS disk; its 97 GiB root filesystem has 36 GiB free.
- /opt/notka/app/cache/audio_v2 occupies 40 GiB.
- /dev/sdb is a separate 256 GiB QEMU disk. It has no partition table, recognized filesystem/signature, LVM membership, or mount.
- The dedicated cache mount keeps audio growth off the root filesystem without changing the application cache path.
- The direct-stream patch is deployed at main commit 14b389e; AUDIO_CACHE_MAX_MB=0 is active and STREAM_LIVE remains off.

## Validation / Blockers
- Read-only checks: lsblk, df, findmnt, wipefs --no-act, fdisk -l, pvs, and /etc/fstab. Only the OS disk is currently mounted; /dev/sdb has no recognized contents.
- No disk migration changes have been made in this follow-up.

## Next Action / Resume
Format the empty spare disk, copy and checksum the cache, mount it persistently at the existing cache path, then verify the service before removing the old copy.