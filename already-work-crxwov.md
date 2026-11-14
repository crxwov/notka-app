# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-14T10:14:59Z
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
Canonical repository: https://github.com/crxwov/notka-app, working branch tg-app.
Only server-patches/track-profile-write-race.patch is in scope; it contains the backend writer fix and the matching focused test. Preserve server-patches/audio-direct-cache.patch and all existing work. No production source, environment, systemd unit, or data changes.

## Stages
1. Refresh canonical coordination, reconcile the previous audio-cache work, and reserve this task — completed.
2. Trace the catalog failure and confirm the shared writer path — completed.
3. Add a deterministic regression test and minimal unique-temp-name fix — implemented in an isolated copy; patch artifact pending.
4. Validate patch applicability and the focused test on an isolated source copy — original source fails regression; patched source passes.
5. Review and publish the scoped patch on tg-app; leave deployment to the designated release action — pending.

## Findings / Decisions
- The 2026-11-14 catalog run failed in track_profile._write() while replacing track_profiles.json.tmp.
- The live app and nightly worker share NOTKA_DATA_DIR; _write() used the same fixed .tmp path, allowing one process to consume the other process's temporary file.
- Live source was read-only copied into .notka-local; its SHA-256 matched the observed production file (8920f14b…b07fbf29). The existing test file also matched the verified production hash.
- The nightly script redirects task output to a separate log, so journalctl -u notka-catalog.service omits the traceback.
- The earlier audio-cache patch is committed at origin/tg-app (1ef398d). The user confirmed that task is closed; this task will not touch its patch or deploy it.
- The live service was active during the read-only check. Its earlier stop was a graceful SIGTERM; no OOM evidence was found. Memory tuning is out of scope.

## Validation / Blockers
- The regression failed against the unchanged live source and passed against the isolated unique-temp-name change.
- The test simulates concurrent writers meeting immediately before replace(), the collision point from the production traceback.
- No production source or runtime configuration has changed.

## Next Action / Resume
Generate and dry-run the scoped backend patch, then review and publish it on tg-app; do not deploy.
