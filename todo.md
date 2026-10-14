# Notka — unfinished work

Shared backlog for leksik and crxwov. Current reservations live in already-work-leksik.md / already-work-crxwov.md. Read fresh origin/main records before starting. An owner below is a suggested planning owner, not an active reservation. Remove a task only when its acceptance criteria pass; keep finished history in Git, not this backlog.

## User feedback still requiring acceptance / decisions

- [ ] UI-01 — Validate previous player/queue/gesture/background fixes on actual phones; confirm lyric-card saving and navigation/layout on Samsung. Historical fixes were reported but device acceptance remains incomplete. Obtain current screen recordings and reproduction details; do not assume old undeployed version labels are still current.
- [ ] UI-02 — Investigate iPhone download failure. Blocked on reporter error/reproduction details; validate actual Telegram/iOS download behavior before completion.
- [ ] CATALOG-01 — Investigate albums assembled from singles/features and define intended album grouping; compare upstream catalog and Notka display, then obtain product decision if semantics change.
- [ ] PRODUCT-01 — Owner decisions needed for language wave, similar songs, profile customization, release-date filtering, year recap and client app roadmap. Split only approved work into concrete acceptance tasks.
- [ ] DOCS-01 — Audit remaining topical docs against current source/runtime; earlier modularization has been published, but some deep descriptions may still drift. Preserve authoritative routing, avoid recreating DOCS.md or duplicate indexes.

## Infrastructure follow-up (inspection report, 2026-10-14)

- [ ] OPS-01 — Identify/administer external nginx/NAT ownership and configuration; record upstream/forwarding/TLS/backup boundaries safely. Current domain→edge→Caddy route is observed; edge config remains unknown.
- [ ] OPS-02 — Verify external backup delivery and rehearse isolated restore; cover .env, service/network/Certbot/DNS config and published cache/shared, besides data. Never publish secrets in Git.
- [ ] OPS-03 — Reconcile stale application proxy on 40001, working sing-box/TUN/mixed proxy on 1080 and legacy WARP recovery path; verify music sources before/after any separately authorized changes.
- [ ] DATA-01 — Validate concurrent bot/API JSON writes; prevent lost updates/tmp collisions with appropriate interprocess or transactional storage. No actual loss incident proven by current static inspection.
- [ ] ANDROID-01 — Verify installed APK version and API URL; align mobile session authorization with Plus/events/analytics, preserve web behavior; accept on real Android device.
- [ ] AUTH-01 — Define and implement approved session expiry/revocation semantics; current mobile token check has no identified lifetime/revoke path.
- [ ] STORAGE-01 — Define quotas/TTL for published shared playlists; audio eviction does not cover cache/shared. Preserve existing share records during any migration.
- [ ] RELEASE-01 — Design reproducible dependency/deploy/rollback checks, including real search/prepare/Range instead of only health; coordinate both developers' release scope.
- [ ] PERF-01 — Measure real concurrent use and provider latency before scaling; multiple workers cannot safely be assumed equivalent with shared JSON/local locks.

## Context and limits

Previous task files were consolidated here. Their history is recoverable from Git (feedback Roadmap existed at aab8398). Old IP/version/"deployed" claims are historical and must be refreshed. Completed infrastructure/documentation work is documented in docs/operations/infrastructure-2026-10-14.md and Git, not queued again.

Provider cookies exist on the server in the inspected snapshot, so the historical "cookies not supplied" item is superseded. VK import/account/domain-purchase ideas were deferred, not approved implementation tasks. Do not resume them without a fresh request.
