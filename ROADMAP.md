# Publish collaboration and infrastructure documentation — 2026-10-14

## Objective
Publish shared two-developer context (Lexic and hackov/crxwov), branch/integration rules, and the verified infrastructure report to origin/main.
## Success Criteria
Authoritative collaboration document with links from human/agent entrypoints; inaccurate architecture/deploy pointers corrected; scoped docs committed and pushed to main and tg-app; remote commit verified. No production deployment or unrelated app-dev changes.
## Stages
1. Inspect identities, instructions and Git state — Completed; evidence: supplied conversation distinguishes Lexic original author and hackov/Egor later collaborator; main/tg-app at06ac710; app-dev has unrelated local history.
2. Update shared docs and entrypoints — Completed; expected coherent, linked documentation; depends on1.
3. Validate, commit, integrate and push — In progress; expected remote main/tg-app commit agreement; depends on2.
## Current State
User explicitly authorized docs edits, commit, main integration and push. Existing read-only infrastructure report included. Work on tg-app.
## Findings and Decisions
Canonical collaboration home docs/operations/collaboration.md. Preserve all graph/workflow/brand rules. Correct misleading modular runtime docs and obsolete deploy server pointers. app-dev remains untouched. Private supplied chat is evidence only and must not be committed. No new ownership restrictions beyond existing branch rules.
## Issues and Failed Attempts
Initial integration-marker validation found working-protocol:end missing in original AGENTS.MD; verified baseline and added closing marker/tag while preserving existing content. Staged whitespace check also found inherited trailing blank lines in preserved feedback Roadmap; trimmed EOF and rechecked. Graph tooling unavailable in prior inspection; this task primarily non-code docs.
## Changed Files and Artifacts
README.md, AGENTS.MD, CLAUDE.md, PROJECT_INDEX.md, docs/README.md, operations docs, getting-started structure docs, existing infrastructure report/hash evidence, ROADMAP.md.
## Validation
Local checks passed: 17 scoped documentation files, 90 local links without broken targets, 43 API registrations matching source, 12/12 saved source matches, preserved graph/context integrations, no credential-like patterns and git diff --check clean. Initial fetch main/tg-app matched HEAD; remote publication verification pending.
## Blockers
None. Real infrastructure gaps stay clearly marked in dated report.
## Next Action
Commit reviewed documentation on tg-app; fast-forward main and push both without force; verify remote refs, then record final completion.
## Resume Context
Publish docs only. Lexic originated Notka; hackov/Egor/crxwov joined later. User authorized main push but not deployment. Keep app-dev and paused feedback work intact.
