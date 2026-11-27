# One command runs one test file, with emulators only when it needs them

**Priority:** low
**Landed:** none
**Gate:** none
**Next:** build `pnpm test:file <name>`

**Pre-approved** under AGENTS.md § Approval — second Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro asked to keep porting in parallel. Verify the gap against the code before building.

**Goal:** an agent picks among several vitest configs by hand to run one file. `pnpm test:file <name>` finds the file, picks its config and starts emulators only when that config needs them.

Source: ordago-apps `scripts/run-test-file.js` (commit 6af154bfc).
