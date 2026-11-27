# A session-start hook makes a fresh checkout usable

**Priority:** low

**Landed:** none
**Gate:** none
**Next:** add a SessionStart hook that installs dependencies only when node_modules is missing

**Pre-approved** under AGENTS.md § Approval — third Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro: "go to everything, keep going". Verify the gap before building.

**Goal:** a worktree started by Remote Control or the web has no `node_modules`; only `scripts/agent-env.sh` installs them. A cheap SessionStart hook that does nothing when deps are present.

Source: ordago-apps `.claude/hooks/session-start.sh` and its `.claude/settings.json` entry.
