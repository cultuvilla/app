---
name: prod-data-repair
description: Use when repairing Firestore data the app's own flows cannot fix — a reference to something deleted (an integrante of a deleted group, a registration whose persona is gone), a function-owned count that drifted, a stale projection row — on dev, beta or prod, or when investigating one read-only. Starts from the referential-integrity audit (`pnpm audit:refs`), then snapshot → dry run → apply → verify → log. Prod writes stay Álvaro's, per run. For schema backfills that gate a deploy use the Backfills section of AGENTS.md; for deploys use `firestore-deploy`; for credentials use `firebase-admin-dev` and `gcloud-cultuvilla`.
---

# Prod data repair

A repair changes data a user or the backend depends on, out of band. Read-only
first; every write is a dry run first; prod writes need Álvaro's go **for that
run** (AGENTS.md *Approval*). Beta is the backend of the Cultuvilla Beta app real
testers use, so a beta write is held to the same standard.

## 0. Is someone already on it?

A repair is often already someone's branch: check before you design one.

```bash
gh pr list --state open --json number,title,headRefName --jq '.[] | "#\(.number) \(.headRefName) — \(.title)"'
git log --all --oneline --grep=<collection-or-field-or-backfill-id>
pnpm backfills:list | grep -i <collection>
```

## 1. Find it: the audit

`scripts/audit-referential-integrity.mjs` runs the invariants in
`packages/shared/src/validation/` (pure, unit-tested) over one env and prints,
per invariant, the count and example paths. Ids only, no PII. It has no write
path.

```bash
pnpm audit:refs                                   # dev
pnpm audit:refs -- --list                         # what it checks
pnpm audit:refs -- --env=beta --invariant=<id> --verbose
pnpm audit:refs -- --env=prod --json=<scratchpad>/prod.json
```

- **Credentials.** Beta and prod read through the stored ADC
  (`~/.config/cultuvilla/adc.json`, see `firebase-admin-dev`). Run with
  `env -u GOOGLE_APPLICATION_CREDENTIALS …`: that variable wins over every other
  source, and in a shell shared with another repo it can point at that repo's
  credential — the run then fails with `7 PERMISSION_DENIED`.
- **No local credentials:** Actions → *Audit Referential Integrity*
  (`audit-referential-integrity.yml`), keyless via WIF. The beta and production
  GitHub Environments are branch-restricted: dispatch with `ref: beta` or
  `ref: main`.
- **A single count mismatch can be a write in flight.** Re-run that invariant
  before calling it drift.
- **An absent counter is not drift.** The count invariants skip a field that is
  missing; that is the conformance gate's finding and a pending `pre-deploy`
  backfill's job.

Then look at each finding before designing anything: when it happened (the
`membershipEvents` log, `registeredAt`, `createdAt`), whether the event it
belongs to is past or upcoming, which flow most likely left it. **The fix to
the flow comes first** — repairing data that a live code path keeps breaking
is a repair you will repeat. File it as a `fix-bug`.

## 2. Pick the vehicle

| The repair | Vehicle |
|---|---|
| Recomputes a function-owned count or a projection | The read model's **backfill of record** (docs/architecture/denormalized-read-models.md) — `backfill-org-member-count`, `backfill-barrio-resident-count`, `backfill-place-burial-count`, `village-people-count`, `backfill-municipality-people`, `backfill-entity-comment-counts` |
| Could recur, or must reach beta/prod without local credentials | A **registered backfill** (AGENTS.md *Backfills*), `kind: 'cleanup'`, `phase: 'none'`, `autoApply: []` — it then runs through Actions → *Run Backfill*, dry run first, and records its marker |
| One-off on a handful of documents | A **reviewed one-off** `scripts/repair-<slug>.mjs` that defaults to a dry run and writes only with `--apply`; reviewed in its PR before any apply; deleted once spent (*Delete > deprecate*) |

Whatever the vehicle, **write through the logic the app uses**, not around it.
A registration removed by a raw delete leaves `confirmedCount`/`totalCount`
wrong and nobody promoted from the waitlist: those counters are kept by the
callables, not by a trigger. Removing a membership owes the `membershipEvents`
log a `removed` entry, in the same transaction (see `deleteAccount`'s
`removeMemberships`). Patching a projection's **source** fires the deployed
trigger, which rewrites the projection with a full `set()` — backfill the source
first, then the projection (AGENTS.md *Backfill the source before the projection*).

## 3. Snapshot

Before any `--apply`, dump the raw JSON of every document the run will touch to
`~/backups/cultuvilla/<YYYY-MM-DD>-<slug>/`. **Not the checkout** (prod user data
one `git add` from a public repo) and **not the session scratchpad** (wiped with
the session; the backup must outlive it). A deleted document is restorable only
from this snapshot. On *Run Backfill*, the dry-run step's log is the record;
have the script print every path and the fields it changes.

## 4. Dry run, then apply

1. Dry run against **dev** with a document shaped like the finding, and read
   back that it did exactly that. Dev (`villa-events`) is autonomous.
2. Dry run against the target env. Read the counts: they must equal the audit's.
   A dry run that touches more than the audit found is a bug in the repair.
3. Apply. Beta: after the dry run, an agent may apply. Prod: show Álvaro the
   dry-run output and the snapshot location; apply only on his go for that run.
   Idempotent: a re-run must find nothing left to do.

## 5. Verify

Re-run the audit for exactly the invariants you repaired — the count must be 0
— and the conformance check for the collections you wrote:

```bash
pnpm audit:refs -- --env=<env> --invariant=<id>[,<id>]
pnpm check:dev-conformance            # dev; beta/prod: --env beta|prod
```

Screens read through `watch*` listeners on the native persistent cache, so a
server write or delete reaches an open screen by itself; a legacy `get*` screen
picks it up on its next focus.

## 6. Log

In the PR (or the report, for a repair through *Run Backfill*): env, invariant
ids, the counts before and after, the snapshot directory, the run URL or
marker, and the flow fix that stops it recurring. Ids and counts only — never
names, phones or emails; this repo is public.
