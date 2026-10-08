# Environment parity: dev and beta are configured like prod

## Context

Dev and beta exist to prove that prod will work. On 2026-10-07 a `storage.rules`
change reached prod and refused every event cover upload, with every test and
deploy green. The rules behaved the same in all three projects; what nothing
did was exercise beta, and nothing asserted that the projects were set up
alike. Measuring them the next day found real drift: beta lacked the Geocoding
and Static Maps APIs `staticMap` uses, only prod had Error Reporting, only beta
had uniform bucket-level access, dev had service-agent grants the others did
not, and beta and prod each carried composite indexes the repo had long
dropped (the index deploy never deleted anything).

## Decision

- **One declared configuration**, [infra/env-parity.json](../../infra/env-parity.json):
  the expected setup of a Cultuvilla project — Firestore database and Storage
  bucket settings, enabled APIs, IAM grants to service accounts, Secret Manager
  names, Auth providers, domains and settings — with project ids and numbers
  normalised to placeholders. Each env may differ only by **declared
  exceptions, each with its reason**; an exception with no real reason, or one
  that changes nothing, is rejected. Prefer fixing the env over adding one.
- **Every deploy checks its own env** ([check-env-parity.mjs](../../scripts/check-env-parity.mjs)):
  `config` first, before any backfill or deploy writes, so a drifted env blocks
  its own deploy; `artifacts` after deploying — live Firestore and Storage
  rules equal the commit's files, composite indexes equal
  `firestore.indexes.json`, deployed functions equal what
  `functions/src/index.ts` exports. Since every env matches the same baseline,
  they match each other.
- **The check runs per env, never across envs.** Each GitHub environment's
  keyless identity is bound to its own branch (dev ← `develop`, beta ← `beta`,
  production ← `main`), so no single job can read all three. A nightly
  [env-parity.yml](../../.github/workflows/env-parity.yml) dispatches itself on
  all three branches to catch changes made between deploys (console edits).
  Locally, `node scripts/check-env-parity.mjs --all` checks all three with the
  operator's ADC, and `--write-baseline` drafts the file from prod.
- **Indexes deploy with `--force`.** The file is the whole truth; a removed
  index is removed everywhere.
- **During a held breaking release** prod's rules and functions are
  deliberately the previous release, so the artifacts check skips them while
  `_admin/announce/pending/prod.holdBackend` is true.

## Consequences

- Changing a project's configuration means changing `infra/env-parity.json` in
  the same PR, and running the change in every env (or declaring why not).
- The deploy identity needs two read-only roles, `roles/iam.securityReviewer`
  and `roles/serviceusage.serviceUsageViewer` (in `setup-ci-deploy-wif.sh`).
- Parity is necessary, not sufficient: something must also exercise beta.
  The upload smoke (`smoke-storage-upload.mjs`) and the E2E lanes do that.
