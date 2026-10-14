# Current work — crxwov

participant: crxwov
agent: Codex
status: paused
updated_at_utc: 2026-10-14T11:29:42Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective
Replace leksik with leksik; introduce todo.md and two published work-state files; consolidate obsolete Roadmaps/instructions; provide Claude onboarding prompt.
## Scope / Conflict Boundaries
README.md, AGENTS.MD, CLAUDE.md, PROJECT_INDEX.md, .gitignore, docs/operations/collaboration.md, documentation identity/routing references, todo.md, already-work-crxwov.md, already-work-leksik.md. May add a scoped Git-only status publishing helper under deploy. No app runtime/backend/Android changes or production deployment. app-dev untouched.
## Success Criteria
Shared backlog/work records and agent rules consistent; pending tasks/brand constraints preserved; publisher excludes unfinished code and preserves peer reservations; scope published to main/tg-app; prompt provided to leksik.
## Stages
1. Read current state and pending legacy tasks — completed.
2. Introduce shared backlog/work state and safe heartbeat publishing — completed; bounded watcher already pushed five periodic snapshots.
3. Consolidate documentation and preserve unfinished tasks — completed; four obsolete Roadmaps removed after pending requirements transfer; detailed brand rules preserved in DESIGN.md.
4. Validate isolated publisher, links and diff; integrate/publish main/tg-app; supply Claude prompt — in progress.
## Findings / Decisions
leksik is the required spelling. Use one backlog and two participant work records instead of Roadmap proliferation. Preserve durable brand/graph rules. Other participant has no work-state record yet; activity cannot be inferred.
## Validation / Issues
Starting worktree clean; remote main/tg-app at aab8398. No overlap claim can be made for leksik until their status is registered. Windows PowerShell blocked initial script execution; process-only ExecutionPolicy Bypass works. PS5 parameter default could not use PSScriptRoot; moved default resolution into script body. Brand verification initially referenced a variable from a previous shell; verified verbatim preservation independently against Git source.
## Validation Results
Isolated Git tests passed: one own record only, latest peer preserved, staged/untracked runtime excluded, working branch/index unchanged, temporary refs removed, no-op created no commit. 98 local links pass; publisher parses; graph/context integration retained; brand copied verbatim from previous CLAUDE into DESIGN; four Roadmaps removed with pending tasks consolidated. TTL module is tracked, so historical fresh-checkout warning is superseded.
## Blockers
No task blocker. leksik current activity remains unknown until they register it. A compound test command with recursive temporary cleanup was rejected by automatic review; safe split validation without recursive cleanup succeeded.
## Next Action / Resume
Integration pause: automatic heartbeat stopped intentionally to avoid concurrent main commits during reconciliation. Reservation retained on protocol/doc files. Commit reviewed changes, merge fresh remote heartbeat history, publish main/tg-app, then publish completed state. No runtime deploy.
