# Referential-integrity audit and a safe repair procedure

**Priority:** high
**Landed:** dev
**Gate:** release:1.14.0
**Next:** after the next release, dispatch "Audit Referential Integrity" with ref beta and with ref main and confirm both run green (read-only), then retire

State 2026-11-27: #766 merged — 50 invariants in `packages/shared/src/validation`, `pnpm audit:refs`, a read-only WIF workflow, the `prod-data-repair` skill. Read-only runs: dev 19 (all seed data), beta 0, prod 6:

- (a) `organizations/fUXt8iSQNfgfVKjgjtOd/members/F6kd…`: an admin membership left under a deleted group (joined 2026-08-19). Repair: delete it and write a `removed` membershipEvent.
- (b) 5 confirmed registrations whose persona was deleted (owners still exist), on two upcoming events: `events/moD7zz28…` (5 Dec, 4 of them) and `events/YJFTs2N3…` (6 Dec, 1). Repair: cancel through cancelRegistration's logic so counts and waitlist promotion stay right. Root cause filed as `ideas/persona-delete-cancels-registrations.md`.
- Repaired 2026-11-27 (Álvaro's go): #786 cancelled the 5 registrations, removed the orphan membership and deleted 15 orphan `registrationPrivate` docs; full prod audit afterwards 0 of 70. Snapshots: `~/backups/cultuvilla/2026-11-27-orphan-refs-prod/`. Flow fixes: #780 (account deletion), #789 (org deletion); persona deletion waits on its idea.
- Every prod municipality lacks `peopleCount`; the pending village-people-count backfill covers it.

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
