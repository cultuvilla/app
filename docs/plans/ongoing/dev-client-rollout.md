# One command builds and installs the dev client on the phone and AVDs

**Priority:** low
**Landed:** none
**Gate:** none
**Next:** build the manual script (no timer wiring)

**Pre-approved** under AGENTS.md § Approval — second Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro asked to keep porting in parallel. Verify the gap against the code before building.

**Goal:** `scripts/dev-sync.sh` only notifies when the native fingerprint changes; nothing builds and installs the dev client. A manual `scripts/dev-client-rollout.sh` (`--if-stale`, `--only phones`). Wiring it into the timer is Álvaro's call.

Source: ordago-apps `scripts/dev-client-rollout.sh` (commits 86910b4cb, 98c6a0cc2, 05c9b4468).
