# Notka — shared agent rules

Two human developers: **leksik** created the original product/design/functionality; **crxwov (hackov / Egor)** joined later and contributes to clients, infrastructure and shared development. Preserve both people's work. Human task authorization determines scope; agents are assistants, not owners.

## Coordination: mandatory before edits

1. Fetch current origin/main and read its todo.md and both already-work-leksik.md / already-work-crxwov.md, not just possibly stale local copies.
2. Read [collaboration rules](docs/operations/collaboration.md); identify the assigning participant. Do not infer identity from branch alone.
3. Inspect task/file/contract overlap. Tell the user about overlapping active work, a stale record, or unknown state before touching the overlapping area. Stale is not permission to take over. Proceed with independent work only.
4. Publish a detailed reservation in the assigning participant's already-work file BEFORE substantive edits. Update and publish immediately on important changes, about every 60 seconds while active, and on pause/block/completion. Use the scoped publisher described in collaboration.md. If publication fails, report it and suspend overlap-dependent changes.
5. Only update your own participant file. Multiple agents for the same participant must coordinate an existing active task rather than silently replace it. These files are advisory coordination, not an atomic distributed lock.
6. todo.md is the shared unfinished backlog. Remove an item only after its acceptance checks pass; record concise results in the current work file/Git. Preserve requirements/blockers of pending work. Private local ROADMAPs, per-chat plans and task-memory files are allowed, but MUST NOT be committed or published. Keep extra private plans under ignored .notka-local/; ROADMAP filename variants are also ignored. Shared coordination must remain complete in todo/already-work rather than depend on private files.

## Git and execution

- tg-app: default agent working branch / Telegram stack. app-dev: human client-app branch, do not alter without an applicable request. main: shared reviewed integration/release state.
- Fetch and inspect history/status before integration. Never force-push/reset/discard another person's work or merge an unrelated whole branch.
- Heartbeat commits go directly to remote main and contain only your one work-state file. Reconcile them before main integration; do not drag unfinished code into a status commit. Prefer deploy/publish-work-state.ps1 with its isolated index.
- Shared API/auth/data changes require checking Telegram and separately bundled Android UI. No compatibility claims based on one client.
- A direct request authorizes its scope; commit/push is not production deployment. Deploy is a separate designated release-developer action.
- Small coherent changes, relevant verification, diff review. Record failures, findings, evidence paths and next action in your work file; never claim unvalidated completion.
- User communication in Russian; internal work and state files in concise English. No secrets/private chat/user data in Git or logs shared with the user.
- Cleanup only established obsolete/generated task clutter after preserving useful facts. Keep runtime code, integrations, credentials, personal assets and unfinished work.

<!-- codebase-memory-mcp:start -->
## Codebase Knowledge Graph

ALWAYS prefer codebase-memory-mcp for indexed code discovery:
1. search_graph — symbols by pattern.
2. trace_path — callers/callees.
3. get_code_snippet — specific source.
4. query_graph — complex Cypher.
5. get_architecture — overview.

Use targeted rg/file listing for literals, errors, configuration, non-code files, or insufficient/unavailable graph tools. Search before reading; narrow large files; ignore build/cache/vendor noise.
<!-- codebase-memory-mcp:end -->

<!-- project-context-map:start -->
## Context map

- [todo.md](todo.md), [leksik work](already-work-leksik.md), [crxwov work](already-work-crxwov.md): unfinished plans, current reservations and resume context.
- [collaboration.md](docs/operations/collaboration.md): canonical roles, heartbeat/conflict protocol and integration.
- [PROJECT_INDEX.md](PROJECT_INDEX.md): actual source routing; README/docs index: human entrypoints.
- [CLAUDE.md](CLAUDE.md): Claude entrypoint to these same rules, not a competing protocol.
- [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md): brand/3D and product constraints; do not change approved references by taste.
- miniapp/: active web UI; android/: separately bundled client; music_resolver/: backend; bot/: polling bot; admin/: owner stats.
- deploy/: release/tools; tests/: inspect actual scripts and their effects before execution.
- [infrastructure snapshot](docs/operations/infrastructure-2026-10-14.md): dated runtime evidence and limits. Current recorded SSH: ssh -p 6767 notka, live app https://notka.duckdns.org/app/. Confirm drift before operational work.
<!-- project-context-map:end -->
