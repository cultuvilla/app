# Block back-merges of beta or main into develop

**Priority:** medium
**Next:** add the check as a step of the existing ci.yml job (not a new job)

**Pre-approved** under AGENTS.md § Approval — second Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro asked to keep porting in parallel. Verify the gap against the code before building.

**Goal:** AGENTS.md relies on beta → main merge commits never reaching develop, and nothing enforces it. A step in the existing `ci.yml` job fails a PR into develop whose commits include merges from beta or main. A separate job would be new running cost and needs a yes.

Source: ordago-apps `.github/workflows/validate-develop-flow.yml`, `scripts/check-develop-back-merge.js` (commit ef52a31d2).
