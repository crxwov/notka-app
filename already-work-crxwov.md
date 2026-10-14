# Current work — crxwov

participant: crxwov
agent: Codex
status: active
updated_at_utc: 2026-10-14T11:19:29Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective
Replace Lexic with leksik; introduce todo.md and two published work-state files; consolidate obsolete Roadmaps/instructions; provide Claude onboarding prompt.
## Scope / Conflict Boundaries
README.md, AGENTS.MD, CLAUDE.md, PROJECT_INDEX.md, .gitignore, docs/operations/collaboration.md, documentation identity/routing references, todo.md, already-work-crxwov.md, already-work-leksik.md. May add a scoped Git-only status publishing helper under deploy. No app runtime/backend/Android changes or production deployment. app-dev untouched.
## Stages
1. Read current state and pending legacy tasks — completed.
2. Introduce shared backlog/work state and safe heartbeat publishing — in progress.
3. Consolidate documentation and preserve unfinished tasks — pending.
4. Validate, commit and publish main/tg-app; supply Claude prompt — pending.
## Findings / Decisions
leksik is the required spelling. Use one backlog and two participant work records instead of Roadmap proliferation. Preserve durable brand/graph rules. Other participant has no work-state record yet; activity cannot be inferred.
## Validation / Issues
Starting worktree clean; remote main/tg-app at aab8398. No overlap claim can be made for leksik until their status is registered.
## Next Action / Resume
Publish initial coordination files, implement scoped publisher, transfer pending tasks and compact entrypoint docs. This activity occupies shared documentation/protocol files.
