# Referential-integrity audit and a safe repair procedure

**Priority:** high

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`).

**Goal:** know, per env, which documents point at something that no longer exists
(a membership to a deleted village, a registration to a deleted event, a count that
disagrees with its source), and have one careful way to repair them.

Source: `~/githubs/ordago-app/ordago-apps` `docs/decisions/referential-integrity-audit.md`,
`scripts/audit-referential-integrity.js`, `scripts/repair-dangling-references.js`, the
invariants in `packages/shared/src/validation`, and the `prod-data-repair` skill. Its
first prod run found 259 violations.

## Done when

- The invariants are pure functions in `packages/shared` with vitest tests; the
  Cultuvilla set is written from this repo's references (village, org, person, event,
  membership, denormalized counts), not copied.
- A read-only audit script runs them against an env (dev locally, beta/prod through a
  keyless workflow like `run-backfill.yml`) and reports counts and examples.
- Repairs go through the backfill harness or a reviewed one-off, dry run first.
- A `prod-data-repair` skill in `.agents/skills/`: snapshot, dry run, verify, log.
  Prod runs stay the user's per run.
