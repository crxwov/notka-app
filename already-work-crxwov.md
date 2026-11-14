# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-11-14T08:52:39Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main

## Objective / Success Criteria
Publish the latest Windows 1.3.0 MSI and Android 2.5.5 APK together in one GitHub Latest release. Remove the remaining platform-only release after preserving its asset. Point README downloads to the combined release.

## Scope / Reservation
Canonical repository: https://github.com/crxwov/notka-app. Release entries `v2.5.5` and `desktop-v1.3.0`, plus `README.md` download links. No client source, server, or production changes. `already-work-leksik.md` and `todo.md` are absent from current origin/main, so leksik work state is unknown; this direct request is limited to the specified release and its download links.

## Stages
1. Fetch origin/main, read available work state, classify releases, and verify current asset hashes, embedded versions, signatures, and tag ancestry — completed.
2. Add Windows MSI to current Android Latest release and update combined title/notes — completed.
3. Delete the Windows-only release after verifying both assets are attached to the combined release — completed.
4. Update README links, verify GitHub Latest and download URLs, and publish completion state — active.

## Findings / Decisions
- `v2.5.5` is GitHub `/releases/latest`, now named `Notka Windows 1.3.0 / Android 2.5.5`, with both current assets and their SHA-256 digests in its notes.
- The Windows-only `desktop-v1.3.0` release was removed after its MSI was copied and verified in `v2.5.5`. Three older combined releases remain.
- The APK hash matches GitHub (`699cc551127a7f89dfcd671829fae12c0c37c67fb7d0d21eca9e351a3f6333bb`), package/version is `space.notka.app` 2.5.5 (code 30), and APK v2/v3 signatures verify.
- The MSI hash matches GitHub (`7d61db76d7220f9d49ca31bae09b0a25bed1114a26a5f1371301b6d9c9b8ec50`), embedded ProductVersion is 1.3.0, and its tagged source commit is an ancestor of origin/main.
- Android's latest-release fallback still sees tag `v2.5.5`; the release title/body expose Android 2.5.5 for version and changelog parsing.

## Validation / Blockers
- The public `/releases/latest` endpoint returns `v2.5.5` with `Notka-Setup-1.3.0.msi` and `notka.apk`, with expected hashes.
- Three historic combined releases remain; no platform-only release remains in the release list.
- The MSI is unsigned. No interactive install or device install was run.
- GitHub connector supports reads only; release edits used the repository GitHub credential through REST without exposing the credential.

## Next Action / Resume
Update README download URLs to `v2.5.5`, push the small documentation commit, then publish completion state.