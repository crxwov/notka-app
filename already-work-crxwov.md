# Current work — crxwov

participant: crxwov
agent: Codex
status: completed
updated_at_utc: 2026-11-14T08:57:22Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: main

## Objective / Success Criteria
Publish the latest Windows 1.3.0 MSI and Android 2.5.5 APK together in one GitHub Latest release. Remove the remaining platform-only release after preserving its asset. Point README downloads to the combined release.

## Scope / Reservation
Canonical repository: https://github.com/crxwov/notka-app. Release entries `v2.5.5` and `desktop-v1.3.0`, plus `README.md` download links. No client source, server, or production changes. `already-work-leksik.md` and `todo.md` were absent from current origin/main, so leksik work state remains unknown.

## Stages
1. Fetch origin/main, read available work state, classify releases, and verify current asset hashes, embedded versions, signatures, and tag ancestry — completed.
2. Add Windows MSI to current Android Latest release and update combined title/notes — completed.
3. Delete the Windows-only release after verifying both assets are attached to the combined release — completed.
4. Update README links, verify GitHub Latest and download URLs, and publish completion state — completed.

## Findings / Decisions
- GitHub Latest is `v2.5.5`, named `Notka Windows 1.3.0 / Android 2.5.5`, containing `Notka-Setup-1.3.0.msi` and `notka.apk`, with both SHA-256 hashes in its notes.
- Removed the Windows-only `desktop-v1.3.0` release after preserving the MSI in the combined release. Three earlier combined releases remain.
- Updated README download links to the combined release and pushed commit `175cf0d` (`docs: обновить ссылки на объединенный релиз`).
- APK: hash `699cc551127a7f89dfcd671829fae12c0c37c67fb7d0d21eca9e351a3f6333bb`; package `space.notka.app`, version 2.5.5, code 30; v2/v3 signatures verify.
- MSI: hash `7d61db76d7220f9d49ca31bae09b0a25bed1114a26a5f1371301b6d9c9b8ec50`; ProductVersion 1.3.0; MSI File table lists embedded `Notka.exe` version 1.3.0.0, 58,457,227 bytes. The release source commit is an ancestor of origin/main.
- Android's latest-release fallback still sees tag `v2.5.5`; the release title/body expose Android 2.5.5 for version and changelog parsing.

## Validation / Blockers
- `/releases/latest` returns `v2.5.5` with both expected assets and digests; both download URLs return HTTP 200 with expected content lengths.
- Three historic combined releases remain; no platform-only release remains in the release list.
- `git diff --check` passed; main is pushed and clean. No client tests or interactive installs were run.
- The MSI is unsigned. Windows may show an installation warning.

## Next Action / Resume
Complete. No pending code, release, or production action.