# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-14T08:47:31Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main

## Objective / Success Criteria
Publish the latest Windows 1.3.0 MSI and Android 2.5.5 APK together in one GitHub Latest release. Remove the remaining platform-only release after the asset is preserved in the combined release. Point README downloads to the combined release.

## Scope / Reservation
Canonical repository: https://github.com/crxwov/notka-app. Release entries `v2.5.5` and `desktop-v1.3.0`, plus `README.md` download links. No client source, server, or production changes. `already-work-leksik.md` and `todo.md` are absent from current origin/main, so leksik work state is unknown; this direct request is limited to the specified release and its download links.

## Stages
1. Fetch origin/main, read available work state, classify releases, and verify current asset hashes, embedded versions, signatures, and tag ancestry — completed.
2. Publish this reservation; add Windows MSI to current Android Latest release and update combined title/notes — active.
3. Delete the Windows-only release after verifying the MSI and APK are attached to the combined release — pending.
4. Update README links, verify GitHub Latest and download URLs, and publish completion state — pending.

## Findings / Decisions
- `v2.5.5` is GitHub's current `/releases/latest`; it contains the Android 2.5.5 APK only.
- `desktop-v1.3.0` contains the Windows 1.3.0 MSI only. Three older releases already contain both platforms and will remain as history.
- The APK hash matches GitHub (`699cc551127a7f89dfcd671829fae12c0c37c67fb7d0d21eca9e351a3f6333bb`), package/version is `space.notka.app` 2.5.5 (code 30), APK v2/v3 signatures verify, and signer fingerprint matches prior release certificate.
- The MSI hash matches GitHub (`7d61db76d7220f9d49ca31bae09b0a25bed1114a26a5f1371301b6d9c9b8ec50`), embedded ProductVersion is 1.3.0, and its tagged source commit is an ancestor of origin/main.

## Validation / Blockers
- Repository state is clean before this reservation. Current origin/main contains only crxwov work state; leksik state and shared todo are unavailable in this repository.
- GitHub connector supports reads only; release edits will use the authorized browser session.
- No blocker to the explicitly assigned release scope.

## Next Action / Resume
Edit current release `v2.5.5` to include the verified MSI, then remove the Windows-only `desktop-v1.3.0` release. Update README links after release verification.