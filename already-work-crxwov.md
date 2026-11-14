# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-14T09:21:02Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Prevent the Notka nightly catalog refresh from failing when the live backend and catalog worker write track profiles concurrently.
- Confirm the shared-file race from the production traceback and source.
- Add a focused regression test that fails with a shared temporary filename.
- Prepare a minimal backend patch artifact in the canonical repository.
- Verify patch applicability and the focused check on an isolated source copy.
- Do not deploy or restart production in this task.

## Scope / Reservation
Canonical repository: `https://github.com/crxwov/notka-app`, working branch `tg-app`.
Only `server-patches/track-profile-write-race.patch` and its focused backend test changes are in scope. Preserve `server-patches/audio-direct-cache.patch` and all existing work. No production source, environment, systemd unit, or data changes.

## Stages
1. Refresh canonical coordination, reconcile the previous audio-cache work, and reserve this task — active.
2. Trace the catalog failure and confirm the shared writer path — completed.
3. Add the regression test and prepare the applyable patch — pending.
4. Validate patch application and the focused test on an isolated copy — pending.
5. Review and publish the scoped patch on `tg-app`; leave deployment to the designated release action — pending.

## Findings / Decisions
- The 2026-11-14 catalog run failed in `track_profile._write()` while replacing `track_profiles.json.tmp`.
- The live app and nightly worker share `NOTKA_DATA_DIR`; `_write()` uses the same fixed `.tmp` path, allowing one process to consume the other process's temporary file.
- The nightly script redirects task output to a separate log, so `journalctl -u notka-catalog.service` omits the traceback.
- The earlier audio-cache patch is committed at `origin/tg-app` (`1ef398d`). The user confirmed that task is closed; this task will not touch its patch or deploy it.
- The live service was active during the read-only check. Its earlier stop was a graceful `SIGTERM`; no OOM evidence was found. Memory tuning is out of scope.

## Validation / Blockers
- Current `origin/main` has no `todo.md` or `already-work-leksik.md`; the available crxwov work record was completed before this reservation.
- The canonical repository keeps backend changes as applyable artifacts because it has no backend source tree.
- No code or runtime changes have been made yet. Production deployment is explicitly excluded.

## Next Action / Resume
Publish this reservation to `origin/main`, then prepare the isolated regression test and backend patch on `tg-app`.
