# Account deletion covers every collection that holds a uid

**Priority:** high
**Landed:** none
**Gate:** none
**Next:** being built by worker h17 in batch 2026-11-27-harvest

**Pre-approved** under AGENTS.md § Approval — second Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro asked to keep porting in parallel. Verify the gap against the code before building.

**Goal:** `functions/src/account/deleteAccount.ts` keeps a hand-written list of what it deletes. Replace it with a registry (each uid-holding collection: delete, anonymise, or keep with a reason) and a test that fails when a collection holding a uid is in none. A collection the test finds missing is a defect against `docs/legal/politica-de-privacidad.md` §7 and is fixed in the same plan.

Source: ordago-apps `functions/src/account/uidCascade/{registry,runner}.ts`, `__tests__/uidCascadeCoverage.test.ts`; commits 446987483, befecc1c6. Build on `packages/shared/src/firebase/refs/collections.ts`.

## Done when

The registry drives deletion, the coverage test runs in CI, and every gap it found is closed.
