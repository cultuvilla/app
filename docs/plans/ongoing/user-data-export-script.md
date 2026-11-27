# Operator script for emailed data access and portability requests

**Priority:** medium
**Landed:** none
**Gate:** none
**Next:** being built by worker h22 in batch 2026-11-27-harvest

**Pre-approved** under AGENTS.md § Approval — second Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro asked to keep porting in parallel. Verify the gap against the code before building.

**Goal:** the privacy policy promises access and portability (`politica-de-privacidad.md`), and nothing exports one user's data. A script that reads the deletion registry and writes one user's data to a local JSON file, plus a `docs/ops/` runbook. Prod runs stay Álvaro's, per request.

Source: ordago-apps `scripts/admin-export-user.js`, `docs/ops/account-deletion-and-data-export-requests.md` (commit befecc1c6).
