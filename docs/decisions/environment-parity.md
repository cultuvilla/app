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
- **A deployed function must also be alive and serving its build.** Listed is
  not running: Órdago found a function whose Eventarc trigger had vanished in
  an interrupted deploy (present, `ACTIVE`, never fired), and one whose
  serving Cloud Run revision ran an older image than the build its metadata
  named, with every metadata check green
  (ordago-apps `docs/decisions/verify-running-cf-container-image.md`). So
  `artifacts` judges each exported function on what actually serves it, and
  fails on any of:
  - its state is not `ACTIVE`, or it carries an `ERROR` state message. A
    function still `DEPLOYING` is re-listed for about 90 s first — `firebase
    deploy` returns once each operation is accepted;
  - it has an event trigger and the Eventarc trigger is missing, delivers
    somewhere else, or reports a condition other than `OK`;
  - its Cloud Run service is missing or not Ready, its traffic is not all on
    the function's own revision, or that revision is not Ready;
  - the serving revision's image is not the one the function's Cloud Build
    pushed: a different package (a cross-wired bundle), or a digest that is
    neither what the build's tag points at nor a version pushed into that
    package while the build ran. Firebase builds one image per batch and names
    its package after the batch's first function, so a later build can move
    that tag for other functions — the push-time window is what tells that
    apart from a stale image.

  The image is compared only when the build finished within 12 hours: the
  Artifact Registry cleanup policy deletes images a day old, tagged or not,
  while Cloud Run keeps serving its imported copy. A deploy's own build is
  always that young, so the post-deploy step always compares it; the nightly
  run compares only what deployed recently. 1st-gen functions have no Cloud
  Run service and are judged on state and trigger alone.
- **Gateways are functions, and need nothing special.** The callable gateway
  (`cloud-run-gateways.md`) is an exported `defineHttpFunction` whose service
  lives in `europe-southwest1`; every location is read from the function's own
  `serviceConfig`, never assumed. A Cloud Run service no exported function owns
  (a future event gateway's Eventarc triggers point at one) is not judged here.
  Órdago's `reconcile-deployed-functions.js`, which redeploys the missing set
  to dev before its E2E lane, was not ported: here every develop merge deploys
  dev from CI, and this check fails that deploy instead.
- **The check runs per env, never across envs.** Each GitHub environment's
  keyless identity is bound to its own branch (dev ← `develop`, beta ← `beta`,
  production ← `main`), so no single job can read all three. A nightly
  [env-parity.yml](../../.github/workflows/env-parity.yml) dispatches itself on
  all three branches to catch changes made between deploys (console edits).
  Locally, `node scripts/check-env-parity.mjs --all` checks all three with the
  operator's ADC, and `--write-baseline` drafts the file from prod.
- **`config` accepts develop's baseline too.** A live project changes the
  moment someone changes it, but a baseline edit reaches beta and main only
  with the next release. So the deploy and the nightly run also fetch
  develop's `infra/env-parity.json`, and an env passes `config` if it matches
  either — reported against its own branch's baseline when it matches neither.
  Without this, removing the appspot editor grant (2026-10-08, declared on
  develop) stopped the 1.8.0 prod deploy, and a whole release was cut only to
  carry the file to main. `artifacts` still compares against the commit.
- **Indexes deploy with `--force`.** The file is the whole truth; a removed
  index is removed everywhere. The deploy first runs a drift report
  (`scripts/check-index-drift.mjs --warn`, locally `pnpm check:index-drift
  --project=<env>`) naming what it will delete. The cost, accepted 2026-10-06:
  an index made by hand in the console (a hotfix while a query fails) vanishes
  on the next deploy unless it is also added to the file. Orphans had built up
  because the deploy ran without `--force`; the cleanup left all three envs at
  live == file (prod and beta 54/54 on the 1.10.0 promotion, 2026-10-09).
- **During a held breaking release** prod's rules and functions are
  deliberately the previous release, so the artifacts check skips them while
  `_admin/announce/pending/prod.holdBackend` is true.

## Consequences

- Changing a project's configuration means changing `infra/env-parity.json` in
  the same PR, and running the change in every env (or declaring why not).
- The deploy identity reads Cloud Run, Eventarc, Cloud Build and Artifact
  Registry for the function check; its deploy roles already cover them.
- The deploy identity needs two read-only roles, `roles/iam.securityReviewer`
  and `roles/serviceusage.serviceUsageViewer` (in `setup-ci-deploy-wif.sh`).
- Parity is necessary, not sufficient: something must also exercise beta.
  The upload smoke (`smoke-storage-upload.mjs`) and the E2E lanes do that.
