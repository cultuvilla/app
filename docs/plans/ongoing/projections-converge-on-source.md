# Projections rebuild from the current source, not from the event

**Priority:** high
**Landed:** none
**Gate:** none
**Next:** being built by worker h15 in batch 2026-11-27-harvest

**Pre-approved** under AGENTS.md § Approval — second Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro asked to keep porting in parallel. Verify the gap against the code before building.

**Goal:** a projection trigger that writes its row from `event.data.after` with a full `set()` can resurrect a deleted person or account when an update is delivered after the delete (for `publicProfiles` that is PII). Re-read the source doc and converge the row on what exists now, as `syncOrgSocioRoster.ts` already does.

Gap: `functions/src/village/syncMunicipalityPeople.ts`, `functions/src/users/syncPublicProfile.ts`, `syncPersonDenormalization.ts`.
Source: ordago-apps `functions/src/shared/convergeOnSource.ts` + its test, commits 3db779d38, 6db87c20e, 1ebc3d233.

## Done when

Each listed projection re-reads its source, a test delivers an update after a delete and the row stays gone, and `docs/architecture/denormalized-read-models.md` states the rule.
