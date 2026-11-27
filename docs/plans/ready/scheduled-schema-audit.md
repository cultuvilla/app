# Weekly schema audit with an unmodeled-field ratchet

**Priority:** medium

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`).

**Goal:** the conformance gate (`scripts/check-dev-conformance.mjs`) runs only at
promotion. Run it weekly against beta and prod too, and track fields documents carry
that no schema models, as a baseline that may only shrink.

Source: `~/githubs/ordago-app/ordago-apps` `.github/workflows/firestore-schema-audit.yml`,
`scripts/audit-firestore-schemas.js`, `check-firestore-audit.js`,
`firestore-audit-ratchet-slice.js`, `admin-firestore-field-census.js`.

## Done when

- A scheduled keyless workflow (WIF, like the deploy gates) reads beta and prod and
  fails closed on real drift, with an allowlist that states a reason per entry.
- An unmodeled-field baseline is committed and CI fails if it grows.
- `pnpm census:fields --collection=<c> --env=<e>` (read-only field tally) exists, for
  tightening converters.
