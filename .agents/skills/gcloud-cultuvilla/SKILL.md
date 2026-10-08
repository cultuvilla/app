---
name: gcloud-cultuvilla
description: Project-specific gcloud facts for cultuvilla. Use whenever running gcloud against this repo (Cloud Logging, IAM, Secret Manager, BigQuery). Encodes the named-config + dev-default-prod-explicit rule and the auth split between gcloud and the firebase CLI. A couple of sections are TODO until the matching infrastructure lands (bespoke IAM, BigQuery).
---

# gcloud — cultuvilla specifics

## Auth

- The gcloud and Firebase CLIs have **independent** credential stores. `firebase login` does not authenticate gcloud, and vice versa. Cloud Logging / IAM / Secret Manager operations need gcloud auth; Firestore deploys via Firebase CLI use Firebase auth.
- If multiple gcloud accounts are credentialed on this machine, switch with `gcloud auth list` + `gcloud config set account <email>` before working on cultuvilla.

## Named config

- Use a dedicated `cultuvilla` named gcloud configuration when working on this repo: `gcloud config configurations activate cultuvilla`. Create it if missing: `gcloud config configurations create cultuvilla`.
- Active project on this config is intentionally `villa-events` (dev). Beta and prod **must** be addressed with explicit `--project=cultuvilla-beta` / `--project=cultuvilla-prod` on every command.
- Rationale: unscoped commands default to dev so a typo or autocomplete misfire can't reach prod. Defensive even against own shell history.

## Project map

| Profile | Project ID | Notes |
|---|---|---|
| development | `villa-events` | Active gcloud project on the `cultuvilla` named config. Cultuvilla web reads from this when `NEXT_PUBLIC_FIREBASE_*` is set to dev values. |
| beta | `cultuvilla-beta` | Manual deploy refused by `firestore-deploy` skill — beta is for promotion via CI / user-insistence, not ad-hoc. |
| prod | `cultuvilla-prod` | Same — promotion only. |

## Cloud Logging

When investigating a Cloud Function failure that the user can repro on dev:

```bash
gcloud logging read 'resource.type=cloud_function AND jsonPayload.handler="<handler-name>"' \
  --project=villa-events --limit=50 --format='value(timestamp,severity,jsonPayload.message)'
```

The `handler` field is set by the v2 logger convention (see the `cloud-function-logging` skill). Without it, filters fall back to log-name grep which is noisy.

For beta/prod, add `--project=cultuvilla-beta` or `--project=cultuvilla-prod` explicitly.

## When deploying functions

- Dev deploys are fine ad-hoc — use the `firestore-deploy` skill.
- Beta/prod deploys: defer to CI when it's wired up, or require explicit user confirmation. Don't run them silently.

## Runtime-SA IAM prerequisites

Some Cloud Functions need IAM the Firebase CLI does **not** grant for you. The CLI
auto-grants secret accessor bindings on deploy (see Secret Manager below), which
makes it easy to assume it handles everything — it does not. These are per-project
facts: a new environment starts without them, and nothing in a `firebase deploy`
will tell you they're missing.

Functions declare no custom `serviceAccount`, so they all run as the **Compute
Engine default SA**, `<project-number>-compute@developer.gserviceaccount.com`.

### Custom-token signing (`roles/iam.serviceAccountTokenCreator` on itself)

`getAuth().createCustomToken(uid)` does **not** sign locally — the admin SDK calls
the IAM Credentials API to sign the JWT *as the caller's own identity*, so the
runtime SA needs `iam.serviceAccounts.signBlob` **on itself**. Without it every
call fails at runtime:

```
FirebaseAuthError: Permission 'iam.serviceAccounts.signBlob' denied on resource
errorInfo: { code: 'auth/insufficient-permission' }
```

**This is not theoretical.** Email-code sign-in (`verifyAuthOtpCode`) shipped to
production without the binding and failed 100% of attempts for the entire life of
the feature: the OTP email sent fine, the code matched fine, then
`createCustomToken` threw a 500. Nothing caught it, because the Auth emulator
stubs custom-token signing and never touches IAM — the whole test suite passes
against a broken project. Note that `roles/iam.serviceAccountTokenCreator` granted
to `firebase-adminsdk-fbsvc@` (which Firebase does set up) does **not** help; the
role must be held by the SA that actually runs the functions.

Grant per project — `--member` and the target SA are deliberately the same
identity (self-binding):

```bash
gcloud iam service-accounts add-iam-policy-binding \
  <project-number>-compute@developer.gserviceaccount.com \
  --member="serviceAccount:<project-number>-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" --project=<project-id>
```

Project numbers: dev `790546266005`, beta `336400380436`, prod `34340110439`.
Takes effect within a minute or two — no redeploy needed.

**Verify (any env):**

```bash
node scripts/check-custom-token-signing.mjs --env dev|beta|prod
```

That script is also a **pre-deploy gate** in
[.github/workflows/deploy-firebase.yml](../../../.github/workflows/deploy-firebase.yml),
running for every env before the first `firebase deploy`, so a project missing the
binding blocks the pipeline instead of shipping a broken auth path. The wiring is
locked in by `packages/shared/test/ci/customTokenSigningGate.test.ts`. The gate
reads IAM via the WIF deployer SA, which needs `roles/iam.serviceAccountViewer`
(granted by `scripts/setup-ci-deploy-wif.sh`).

**When adding a function that mints custom tokens**, this binding is a
prerequisite in every env — check it before assuming a signing failure is a code
bug.

## Secret Manager

Cultuvilla uses Secret Manager (enabled on `villa-events`). Cloud Functions read
secrets via `defineSecret` from `firebase-functions/params`.

### Secrets that exist

| Secret | Env | Consumed by | Notes |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | dev (`villa-events`) | `staticMap`, `geocodeSearch` (`functions/src/maps/`) | A **restricted** Google Maps Platform key: API-target-restricted to Maps Static API + Geocoding API only. Server-side only — never shipped to clients. **Not yet created on beta/prod** — must be created per-project before those functions deploy there. |
| `OBSERVABILITY_USER_ID_SALT` | none yet | `logClientError`, `getUserIdHash` (`functions/src/observability/`) | HMAC salt that pseudonymizes uids in telemetry — the server-side `log.*` chokepoint (`functions/src/shared/observability.ts`) hashes `user.id` with it before anything reaches Cloud Logging. Server-side only — never shipped to clients. **Not yet created on any env** — create on dev via the recipe below before the observability callables deploy; create per-project on beta/prod before deploy there. |
| `RESEND_API_KEY` | dev (`villa-events`), beta (`cultuvilla-beta`), prod (`cultuvilla-prod`) | `sendAuthSignInEmail` (`functions/src/auth/`) | A **send-only** Resend API key, unrestricted (a `--domain-id`-restricted `sending_access` key was tried first but Resend returned a token that failed auth on every endpoint — file a support ticket before retrying that path). Sends the branded auth sign-in email from the verified `acceso.cultuvilla.es` domain, shared across all three environments. Server-side only — never shipped to clients. Each environment has its **own key value** (`cultuvilla-dev-send` / `cultuvilla-beta-send` / `cultuvilla-prod-send` in the Resend dashboard) so sends stay attributable per-env in Resend's logs, even though they all send from the same domain. |

### How functions read it

`functions/src/maps/secret.ts` declares `export const GOOGLE_MAPS_API_KEY = defineSecret('GOOGLE_MAPS_API_KEY')`. Each consuming function binds it in its options (`secrets: [GOOGLE_MAPS_API_KEY]`) and reads it at runtime with `GOOGLE_MAPS_API_KEY.value()`. On `firebase deploy`, the CLI auto-grants `roles/secretmanager.secretAccessor` on the secret to the functions runtime SA (`<project-number>-compute@developer.gserviceaccount.com`) — no manual IAM step.

### Creating a Maps key + secret (the flow used for dev)

API restriction (not app/referrer restriction) is the right protection here: the key lives only in Secret Manager and is used server-to-server by Cloud Functions, whose egress IPs are dynamic.

```bash
gcloud config configurations activate cultuvilla   # dev = villa-events
gcloud services enable static-maps-backend.googleapis.com geocoding-backend.googleapis.com apikeys.googleapis.com --project=villa-events
# Mint a key restricted to the two Maps APIs; capture ONLY the keyString to a 0600 temp file.
TMP=$(mktemp); chmod 600 "$TMP"
gcloud services api-keys create \
  --display-name="cultuvilla maps dev (staticMap+geocode proxy)" \
  --api-target=service=static-maps-backend.googleapis.com \
  --api-target=service=geocoding-backend.googleapis.com \
  --project=villa-events --format="value(response.keyString)" > "$TMP"
# Store as the firebase-managed secret (value never echoed), then shred the file.
bash scripts/firebase.sh functions:secrets:set GOOGLE_MAPS_API_KEY --data-file "$TMP" --project dev
shred -u "$TMP"
```

For **beta/prod**, repeat with `--project=cultuvilla-beta` / `--project=cultuvilla-prod` and `--project beta` / `--project prod` on the firebase call. CI deploys the function code, but the secret must already exist in that project or the deploy fails.

### Rotate

```bash
# add a new version (old versions stay until disabled/destroyed); functions pick up the latest on next deploy/cold-start
printf '%s' "$NEW_KEY" | gcloud secrets versions add GOOGLE_MAPS_API_KEY --data-file=- --project=villa-events
```

Prefer `firebase functions:secrets:set GOOGLE_MAPS_API_KEY --data-file <file>` when rotating a firebase-managed secret, so the CLI re-binds versions on deploy.

### Rules

- **Never** `gcloud secrets versions access` (or otherwise print) a secret value — it pollutes shell history and logs. Read length / metadata only when verifying.
- When piping a key into a secret, write it to a `chmod 600` temp file and `shred -u` it; never pass the value as a command-line argument.

### Creating the observability salt (mirrors the Maps key flow)

Same shape as `GOOGLE_MAPS_API_KEY` above, but the secret is a random high-entropy value rather than an API key — nothing to restrict at the API level, since it never leaves Secret Manager / the functions runtime.

```bash
TMP=$(mktemp); chmod 600 "$TMP"
head -c 32 /dev/urandom | base64 > "$TMP"
bash scripts/firebase.sh functions:secrets:set OBSERVABILITY_USER_ID_SALT --data-file "$TMP" --project dev
shred -u "$TMP"
```

For beta/prod, repeat with `--project beta` / `--project prod` on the firebase call before those functions deploy to that project — same rule as `GOOGLE_MAPS_API_KEY`.

**Rotate:** add a new secret version the same way (`functions:secrets:set` again, or `gcloud secrets versions add OBSERVABILITY_USER_ID_SALT`). Unlike the Maps key, rotating this salt is **not** a routine operation — every hashed uid already written to Cloud Logging was computed with the old salt, so a rotation invalidates every existing hash→identity join (an old log line's `user.id` hash can no longer be matched to a live user). Treat rotation as the deliberate "sever all telemetry back-references to identity" action — the GDPR-erasure nuclear option — not a periodic hygiene task.

**Cloud Logging / Error Reporting:** `logClientError` logs at `ERROR` severity with `jsonPayload.handler="logClientError"`, so client errors are filterable independently of server-side function errors:

```bash
gcloud logging read 'jsonPayload.handler="logClientError"' --project=villa-events --limit=50 \
  --format='value(timestamp,jsonPayload.error.name,jsonPayload.route)'
```

Because they land at `ERROR` severity with a stack trace field, matching entries auto-group into Cloud Error Reporting issues (grouped by `error.name` + stack shape) — no separate instrumentation needed. Enable **Error Reporting** in the console for the project and add an **email notification** for new/spiking error groups (the design's alerting choice — see the `observability-conventions` skill for the day-to-day debugging runbook).

## Cloud Monitoring — alerts as code

Log-based metrics, the `cultuvilla-ops-health` dashboard, the alert policies and
the `cultuvilla.app@gmail.com` email channel are defined in
`scripts/lib/monitoring.mjs` and applied with
`pnpm monitoring:apply --project=<id> [--confirm]` (dry run by default,
idempotent). Never edit them in the console — the next apply overwrites it.
Creating an alert on a log-based metric can return a 500 naming the Logging
"control requests per minute" quota; the script waits and retries.

## TODO — fill in when the matching infrastructure lands

- [ ] **IAM grants for service accounts.** No bespoke service accounts beyond default Firebase ones today. When custom ones are introduced, list the role grants and the `gcloud projects add-iam-policy-binding` invocation per env.
- [ ] **BigQuery dataset(s) for analytics.** None today; document if added.

Until these land, the active sections above are sufficient.
