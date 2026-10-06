---
name: firebase-admin-dev
description: How to interact with the cultuvilla dev Firebase project (`villa-events`) from Node scripts via the firebase-admin SDK — credentials, the user-ADC permissions gotcha, idempotent seed patterns, and how to wipe seed data without read perms. Use whenever writing or running a Node script that touches dev Firestore/Auth (seeding, backfills, one-off cleanups), or when an admin SDK call returns `PERMISSION_DENIED`.
---

# Firebase admin SDK — dev (`villa-events`)

This skill is for **Node scripts** using `firebase-admin` against the dev project. For Firestore *rule/index/function deploys* see [firestore-deploy](../firestore-deploy/SKILL.md). For Cloud Logging / IAM / Secret Manager see [gcloud-cultuvilla](../gcloud-cultuvilla/SKILL.md).

## Targeting a named env? Go through the resolver

For any script that must run against a specific env (dev/beta/prod) — grants, backfills, cleanups — initialize through [scripts/lib/env-credentials.mjs](../../../scripts/lib/env-credentials.mjs) rather than wiring credentials by hand:

```js
import { initAdminForEnv } from '../lib/env-credentials.mjs';
const { env, projectId, auth } = initAdminForEnv('beta'); // or 'dev' | 'prod' | a project id
```

It pins `projectId` and resolves the credential in order: `GOOGLE_APPLICATION_CREDENTIALS` override → `~/.config/cultuvilla/<env>-sa.json` (a key) → `~/.config/cultuvilla/adc.json` (stored user ADC) → system default ADC. Canonical consumer: [scripts/grant-app-admin.mjs](../../../scripts/grant-app-admin.mjs); full policy: [docs/ENVIRONMENTS.md](../../../docs/ENVIRONMENTS.md#admin-sdk-credentials-per-env).

**beta/prod block downloaded SA keys** (`iam.disableServiceAccountKeyCreation` org policy, Google secure-by-default), so they authenticate **keylessly** via a captured user ADC. Set it up once, as a project Owner:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project cultuvilla-beta
cp ~/.config/gcloud/application_default_credentials.json ~/.config/cultuvilla/adc.json && chmod 600 ~/.config/cultuvilla/adc.json
```

The copy into `adc.json` isolates cultuvilla from the single global default-ADC file (which every `application-default login`, for any project, overwrites) — so you never re-login. One Owner login covers dev+beta+prod.

## Credentials — service-account key (dev convenience)

The admin SDK resolves credentials in this order:

1. `GOOGLE_APPLICATION_CREDENTIALS` env var → service-account JSON key.
2. `gcloud auth application-default login` → user credentials.
3. Compute metadata (GCE/Cloud Run).

**Use a service-account key for cultuvilla dev work.** User ADC has bitten us before: a freshly-`gcloud auth application-default login`'d account had enough perms for one-off writes but failed with `PERMISSION_DENIED` on reads and on subsequent runs (likely `roles/datastore.user` missing or quota-project mismatch). The symptom is confusing — code 7 PERMISSION_DENIED — because the admin SDK is normally assumed to bypass everything.

Service account perms are bound to the key, scoped to the project, and don't depend on the developer's IAM grants.

### One-time setup

1. **Generate key:** [Firebase console → Project settings → Service accounts](https://console.firebase.google.com/project/villa-events/settings/serviceaccounts/adminsdk) → *Generate new private key*.
2. **Move out of repo + lock down:**
   ```bash
   mkdir -p ~/.config/cultuvilla
   mv ~/Downloads/villa-events-firebase-adminsdk-*.json ~/.config/cultuvilla/dev-sa.json
   chmod 600 ~/.config/cultuvilla/dev-sa.json
   ```
The resolver auto-discovers `~/.config/cultuvilla/dev-sa.json`, so most dev work needs no env var at all. A few scripts (`upload-escudos.mjs`, `wipe-dev-everything.mjs`) hard-require `GOOGLE_APPLICATION_CREDENTIALS`, which is why the repo carries a directory-scoped [.envrc](../../../.envrc) (direnv) that exports it. Two rules around that:

- **Never export it from `~/.bashrc`.** A global export follows you into every other project's admin SDK — it made Órdago's backfill tooling fail with `Missing or insufficient permissions`, which reads as a Firestore rules problem rather than an auth one. `.envrc` scopes it to this repo; run `direnv allow` once after cloning.
- **Repo-scoped is not beta/prod-safe.** Beta and prod scripts run *from this repo*, so the `.envrc` export is live exactly where it does damage: it overrides the target env's credential and trips the project-match guard. Every beta/prod invocation must strip it — `env -u GOOGLE_APPLICATION_CREDENTIALS pnpm backfills:run --env=beta …` — as the backfill scripts already document in their headers.

`.gitignore` blocks `*firebase-adminsdk*.json`, `*service-account*.json`, `*-sa.json` — never relax those.

### `gcloud` config can be anywhere

The admin SDK reads the key file directly. It doesn't care what `gcloud config get project` says. It is fine to have `gcloud` pointed at an unrelated project (e.g. `ordago-prod`) while admin scripts run against `villa-events`. Do **not** try to "fix" gcloud config to match — orthogonal systems.

## Initializing the SDK

Always pin `projectId` explicitly. Don't rely on `GCLOUD_PROJECT` / metadata inference for safety.

```js
import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'villa-events' });
const db = admin.firestore();
const auth = admin.auth();
const { GeoPoint } = admin.firestore;
```

**Seed and wipe** scripts are dev-only: demo data never belongs on beta (real testers use it) or prod. **Registered backfills and repairs** may run on beta without asking (AGENTS.md § Approval) — dry run first, then `--apply --confirm`, counts logged; prod stays the user's, per specific run. A seed or wipe script mirrors the guard from [scripts/seed/lib/context.mjs](../../../scripts/seed/lib/context.mjs):

```js
if (projectId !== 'villa-events') {
  console.error('Refusing to run against', projectId, '— dev only.');
  process.exit(1);
}
```

The sanctioned exception is a **deliberate per-env admin op** (e.g. `grant-app-admin`) run through `env-credentials.mjs`, which requires an explicit `--env` and, for beta/prod, an explicit `--yes`. That is a bootstrap action the user asked for, not a stray dev script pointed at prod by accident.

## Data shape — reuse the existing builders, never re-declare

`packages/shared/src/models/**/*DataModel.ts` exports `build*Data()` helpers (`buildMunicipalityData`, `buildOrganizationData`, `buildEventData`, `buildLocationData`, `buildUserData`, `buildVillageMemberData`, `buildVillageCommunity`). **Use them**. Hand-rolled object literals drift from production shape the moment a field is added.

Two import paths:

- **Bundled apps** (web / mobile / functions): `import { buildXData } from '@cultuvilla/shared'`.
- **Plain Node scripts**: the shared package's `dist/` is bundler-targeted (directory imports that Node ESM rejects). Hit the concrete `.js` files directly:
  ```js
  import { buildMunicipalityData } from '@cultuvilla/shared/dist/models/municipality/MunicipalityDataModel.js';
  import { buildEventData } from '@cultuvilla/shared/dist/models/event/EventDataModel.js';
  // ...etc
  ```
  Always `pnpm shared:build` first so `dist/` is current — wire that into the pnpm script:
  ```json
  "seed:dev": "pnpm shared:build && node scripts/seed/all.mjs"
  ```

The builders are pure (TS elides the `firebase/firestore` type-only imports at compile time) so they have zero runtime dependencies in Node.

## GeoPoint and Timestamp

- Pass `new admin.firestore.GeoPoint(lat, lng)` into builders that accept coordinates. The builders just pass it through.
- Pass `new Date()` for date fields; admin SDK auto-converts to Timestamp on write.

Do not mix `firebase/firestore`'s `GeoPoint` class with admin SDK writes — different prototype, will not serialize correctly.

## Idempotent seeds — the deterministic-ID rule

Every seed doc gets:

1. A **deterministic ID** prefixed `seed-` (e.g. `seed-village-aranjuez`, `seed-org-aranjuez-ayto`, `seed-event-aranjuez-ayto-verbena`).
2. A **batch tag**: `{ seedBatch: 'dev-fixtures-v1' }` on every doc.
3. Written via `ref.set(data, { merge: true })` so re-runs upsert, never duplicate.

Why both ID *and* batch tag:

- Deterministic IDs let `wipe` enumerate refs without queries (see below).
- The `seedBatch` tag lets a future cleanup find docs even if naming drifts.

## Wipe scripts — enumerate, don't query

Service accounts have full perms, so queries do work. But for resilience against the user-ADC fallback case, prefer **deterministic enumeration**:

```js
function listSeedDocRefs() {
  const refs = [];
  for (const v of VILLAGES) {
    refs.push(db.collection('municipalities').doc(v.id));
    // ... orgs, events, etc.
  }
  return refs;
}
async function wipe() {
  const batch = db.batch();
  listSeedDocRefs().forEach((r) => batch.delete(r));
  await batch.commit();
}
```

`batch.delete()` on a non-existent doc is a no-op, so this is safe even on a partially-seeded DB.

For ancillary docs that depend on UID (`admins/{uid}`, `users/{uid}`, `municipalities/{id}/members/{uid}`): look up the UID via `auth.getUserByEmail(seedEmail)` — Auth perms are reliably available with the service account.

## Auth users

- `auth.getUserByEmail(email)` first; create only on `auth/user-not-found`.
- `auth.deleteUser(uid)` for cleanup. The wipe script removes any throwaway `*@cultuvilla.dev` seed users so the project doesn't accumulate dead accounts.
- The seed-created throwaway user should have `emailVerified: true` to skip verification gates in the app.
- After Auth user creation, write `users/{uid}` (profile) and (optionally) `admins/{uid}` (the marker `adminService.isAppAdmin` reads).

## Standard env vars for scripts

| Var | Purpose |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service-account key. From the repo's `.envrc` (direnv). Strip it with `env -u` for beta/prod. |
| `ADMIN_UID` | Existing Auth UID to attribute seed data to. Skip Auth lookup. |
| `ADMIN_EMAIL` | Look up existing Auth user by email (e.g. your real Google account). |
| `ADMIN_PASSWORD` | Only used when creating a *new* email/password user. |

`ADMIN_EMAIL` is the preferred path for any developer who already logged into the app once with Google — the script finds the existing UID, no throwaway account.

## Entry points

| pnpm script | What it does |
|---|---|
| `pnpm seed:dev` | Builds `@cultuvilla/shared`, then runs the orchestrator ([scripts/seed/all.mjs](../../../scripts/seed/all.mjs)) — seeds all domains. Requires `GOOGLE_APPLICATION_CREDENTIALS`. |
| `pnpm seed:dev:wipe` | Removes seed-tagged docs (ID-enumerated) in reverse order. Also deletes throwaway Auth users. |
| `pnpm seed:dev:<domain>` | À-la-carte seeder (`users`/`villages`/`orgs`/`places`/`events`/`news`), `:wipe` variants too. |
| `pnpm seed:images` | One-time, network: downloads `images.manifest.mjs` entries into the dataset's `images/` (commit them). Not run at seed time. |
| `pnpm seed:municipalities` | INE municipalities reference data. Separate concern from dev fixtures. |

When adding a **new** one-off script:

1. Put it under `scripts/`.
2. Mirror the project guard, deterministic IDs, `seedBatch` tag, and ID-based wipe pattern from the shared lib at [scripts/seed/lib/](../../../scripts/seed/lib/) (or [scripts/seed/news.mjs](../../../scripts/seed/news.mjs) for a per-domain example).
3. Add a pnpm alias in root `package.json`.
4. Document it in the script's own header comment.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `PERMISSION_DENIED` on read but writes work | User ADC with limited IAM | Switch to service-account key (this skill). |
| `ERR_UNSUPPORTED_DIR_IMPORT` from `@cultuvilla/shared` | Node ESM rejecting bundler-style directory imports | Use deep `dist/.../FileModel.js` imports. |
| `auth/user-not-found` on `ADMIN_EMAIL` | User hasn't logged into the app yet, or typo | Have them sign in once, or pass `ADMIN_UID` instead. |
| `INVALID_ARGUMENT` on GeoPoint | Mixed `firebase/firestore` GeoPoint with admin SDK | Use `admin.firestore.GeoPoint`. |
| `Quota project ... permission denied` warning at gcloud login | gcloud `core/project` is elsewhere | Ignore — admin SDK uses the key, not gcloud config. |

## Don'ts

- Do **not** commit a service-account key. The `.gitignore` patterns are a safety net, not the primary defense.
- Do **not** run seed/wipe scripts against beta/prod (the project-id guard catches this), or any write against prod without the user's go for that run.
- Do **not** re-declare model shapes inline — use `build*Data()` helpers.
- Do **not** rely on Firestore queries inside wipe paths. Enumerate IDs.
- Do **not** use `gcloud auth application-default login` to "fix" admin SDK perms — it papers over the real issue and creates a flaky setup.
