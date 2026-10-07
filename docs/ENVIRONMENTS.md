# Environments

Cultuvilla runs in three long-lived environments. Each maps to its own
Firebase project; the active env is selected at build time by a single
`APP_ENV` variable read by `apps/mobile/app.config.ts`.

| Concern             | dev                              | beta                              | prod                              |
| ------------------- | -------------------------------- | --------------------------------- | --------------------------------- |
| Firebase project    | `villa-events`                   | `cultuvilla-beta`                 | `cultuvilla-prod`                 |
| `.firebaserc` alias | `dev` (also the `default`)       | `beta`                            | `prod`                            |
| Firestore region    | `europe-southwest1` (Madrid)     | `europe-southwest1` (Madrid)      | `europe-southwest1` (Madrid)      |
| Hosting URL (web)   | `villa-events.web.app`           | `cultuvilla-beta.web.app`         | `cultuvilla.es` (custom domain on `cultuvilla-prod`) |
| iOS bundle id       | `com.cultuvilla.app.dev`         | `com.cultuvilla.app.beta`         | `com.cultuvilla.app`              |
| `APP_ENV` value     | `dev`                            | `beta`                            | `prod`                            |

The web build is the Expo web export served by Firebase Hosting; the
native builds are produced by EAS. All three targets share the same
`apps/mobile/` source tree.

## Configuration model

The active env is chosen by `APP_ENV` (`"dev" | "beta" | "prod"`).
`apps/mobile/app.config.ts` reads per-env-suffixed env vars at config
evaluation time and bakes them into `Constants.expoConfig.extra` so the
running app picks the right Firebase project:

| Field               | Var name pattern                  |
| ------------------- | --------------------------------- |
| `apiKey`            | `FIREBASE_API_KEY_<ENV>`          |
| `authDomain`        | `FIREBASE_AUTH_DOMAIN_<ENV>`      |
| `projectId`         | `FIREBASE_PROJECT_ID_<ENV>`       |
| `storageBucket`     | `FIREBASE_STORAGE_BUCKET_<ENV>`   |
| `messagingSenderId` | `FIREBASE_MESSAGING_SENDER_ID_<ENV>` |
| `appId`             | `FIREBASE_APP_ID_<ENV>`           |

Plus Google Sign-In OAuth client IDs (`GOOGLE_WEB_CLIENT_ID_<ENV>`,
`GOOGLE_IOS_CLIENT_ID_<ENV>`, `GOOGLE_IOS_URL_SCHEME_<ENV>`).

`<ENV>` is `DEV`, `BETA`, or `PROD`. All three sets can live in the same
`apps/mobile/.env` so you can switch which env you talk to locally by
editing one line (`APP_ENV`) — no need to swap files.

Firebase Web SDK config values are not secrets per
[Firebase docs](https://firebase.google.com/docs/projects/api-keys); they
live in env vars for cleanliness, not for security. Security is enforced
by Firestore/Storage rules and (optionally) App Check.

## Local development setup

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Fill in FIREBASE_*_DEV with villa-events Web SDK config
# (Firebase console → villa-events → Project settings → Web app)
# Leave BETA and PROD blank if you only want to work against dev locally.

pnpm install
pnpm --filter cultuvilla-mobile start
```

To switch to beta or prod locally, change `APP_ENV` to `beta` or `prod`
and ensure the corresponding `_BETA` / `_PROD` vars are filled in. Expo
auto-loads `apps/mobile/.env` on `expo start` / `expo export`; restart
the dev server after editing.

`apps/mobile/.env` is gitignored.

### Disaster recovery: rebuilding `apps/mobile/.env`

If the file is ever lost, every value can be restored from
[GitHub repo settings → Secrets and variables → Actions](https://github.com/cultuvilla/app/settings/secrets/actions):

- **Variables** (readable): `APP_ENV`, `EAS_PROJECT_ID`, all `FIREBASE_*` and
  `GOOGLE_*` keys. These are public identifiers — visible in the dashboard
  by design, so you can copy them straight back into `.env`.
- **Secrets** (write-only): `EXPO_TOKEN`. If lost, mint a fresh one at
  https://expo.dev/settings/access-tokens and re-set it.

There is no central read-time secret store for these values — they only
exist as a backup. The deployer's local `apps/mobile/.env` remains the
source of truth that Expo bakes into the bundle at build time.

```bash
# Rebuild .env from the repo (requires `gh` CLI, repo admin):
cd apps/mobile
{
  for v in $(gh variable list --json name -q '.[].name'); do
    printf '%s=%s\n' "$v" "$(gh variable get "$v")"
  done
  echo "EXPO_TOKEN=<paste from expo.dev / 1Password>"
} > .env
```

## Where deploy-time values live

Firebase Hosting serves a static bundle — there is no server runtime and
no central env-var store. The Expo build (`pnpm app:web:build`) inlines
whatever's in `apps/mobile/.env` on the deployer's machine into the
bundle. That makes the deployer's local `.env` the source of truth for
hosting deploys.

Practical consequence: to change the prod Firebase project the hosted
web app talks to, you edit `apps/mobile/.env` on the deployer's machine
and re-run `pnpm deploy:hosting:prod`. There is no dashboard step.

The only real secret in the stack is `EXPO_TOKEN` (EAS robot access).
If CI ever drives EAS builds, that goes in **GitHub Actions repo
secrets**, not in `.env`.

## Deploying via CI (default)

Deploys are driven by the branch model — you don't run them by hand for shared
environments. Merging into a branch runs `.github/workflows/deploy-<env>.yml`
(a thin caller of the reusable `deploy-firebase.yml`), which deploys
rules → indexes → functions → hosting to that env:

| Merge into | Deploys to | Gate |
|---|---|---|
| `develop` | dev (`villa-events`) | auto |
| `beta` | beta (`cultuvilla-beta`) | auto |
| `main` | prod (`cultuvilla-prod`) | manual approval (`production` GitHub Environment) |

- **Auth is keyless (Workload Identity Federation).** Each project has a
  `github-actions` WIF pool + `github` OIDC provider that trusts only this repo,
  and a `gha-deployer` service account impersonated only by pushes to that env's
  branch. No service-account keys exist to rotate or leak.
- **Config lives in GitHub Environment variables** (`dev` / `beta` / `production`):
  `GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `APP_ENV`, and the Firebase web config
  under generic names (`FIREBASE_API_KEY`, …). The workflow maps them to the
  `FIREBASE_*_<ENV>` names `app.config.ts` reads. Google Sign-In needs
  `GOOGLE_WEB_CLIENT_ID` set per env (dev has it; beta/prod pending OAuth clients).
- **Skip a deploy** by putting `[skip-deploy]` in the merge commit message.

To reprovision the GCP side (WIF pools/providers + deployer SAs) from scratch,
run [scripts/setup-ci-deploy-wif.sh](../scripts/setup-ci-deploy-wif.sh)
(idempotent). Then set `GCP_WIF_PROVIDER` / `GCP_SERVICE_ACCOUNT` and the
Firebase web config as GitHub Environment variables.

## Deploying manually (local, per-env)

Still available for one-offs. Every deploy script is explicit per environment.
There is no bare `firebase deploy` — that prevents accidental prod deploys.

```bash
# Hosting (Expo web export → Firebase Hosting)
pnpm deploy:hosting:dev     # → villa-events.web.app
pnpm deploy:hosting:beta    # → cultuvilla-beta.web.app
pnpm deploy:hosting:prod    # → cultuvilla-prod.web.app

# Backend (rules / indexes / Cloud Functions)
pnpm deploy:rules:dev          # firestore rules + storage rules
pnpm deploy:indexes:dev        # firestore indexes
pnpm deploy:firestore:dev      # rules + indexes
pnpm deploy:functions:dev      # build + deploy cloud functions
pnpm deploy:all:dev            # everything

# Same suffixes for :beta and :prod.
```

Prerequisites:
- `firebase login` once on your machine.
- For beta/prod: be authenticated against a Google account with Editor
  or higher on the corresponding GCP project.
- `apps/mobile/.env` filled in with the matching env's Firebase config.

## Seeding data

The seed script always reads its target from `GOOGLE_CLOUD_PROJECT`:

```bash
# DEV
GOOGLE_CLOUD_PROJECT=villa-events pnpm seed:municipalities

# BETA
GOOGLE_CLOUD_PROJECT=cultuvilla-beta pnpm seed:municipalities

# PROD (must be explicit, never automated)
GOOGLE_CLOUD_PROJECT=cultuvilla-prod pnpm seed:municipalities
```

The script has no `:beta` / `:prod` shortcuts — seeding non-dev is a
deliberate manual act.

## Admin-SDK credentials (per env)

Some bootstrap steps can't happen in-app and need a Node script running the
firebase-admin SDK against a specific project — chiefly **granting the first
app-admin** (writing `/admins/{uid}`, which rules deny to all clients).
[scripts/lib/env-credentials.mjs](../scripts/lib/env-credentials.mjs) is the one
place that maps env → project → credentials and initializes the SDK; any per-env
admin script goes through it. It resolves credentials in two ways:

Everything lives **outside the repo** under `~/.config/cultuvilla/` (dir
`chmod 700`, each file `chmod 600`). The resolver checks, in order:

1. `GOOGLE_APPLICATION_CREDENTIALS` (a path; any credential type) — explicit override.
2. `~/.config/cultuvilla/<env>-sa.json` — a service-account **key** for that env.
3. `~/.config/cultuvilla/adc.json` — a stored **user credential** covering every
   env its principal can access (dev/beta/prod).
4. The system default ADC.

**Keyless is the primary path (and the only option for beta/prod).** beta and
prod enforce the `iam.disableServiceAccountKeyCreation` org policy (Google
secure-by-default since May 2024), so **downloaded service-account keys cannot be
created there** — and shouldn't be. Authenticate once as a project Owner and
**capture that login into the persistent `adc.json`** so it survives other
projects' logins (the system default ADC is a single global file that every
`gcloud auth application-default login` overwrites):

```bash
gcloud auth application-default login                       # sign in as a cultuvilla Owner
gcloud auth application-default set-quota-project cultuvilla-beta
cp ~/.config/gcloud/application_default_credentials.json ~/.config/cultuvilla/adc.json
chmod 600 ~/.config/cultuvilla/adc.json
```

That's a **one-time** setup: `cultuvilla.app@gmail.com` is Owner of dev, beta and
prod, so a single `adc.json` serves all three (projectId is pinned in code). You
never re-login for cultuvilla, and unrelated projects (e.g. ordago) can clobber
the system default ADC freely without affecting this store. For stricter
isolation you can instead impersonate the env's `firebase-adminsdk-fbsvc@<project>`
SA — also keyless.

**Service-account key file (dev-only, legacy).** Where key creation is allowed
(dev `villa-events`), a key may live at `~/.config/cultuvilla/<env>-sa.json`; its
`project_id` must match the target env. CI never uses any of these — it
authenticates via keyless WIF (see above). Never commit a credential —
`.gitignore` blocks `*-sa.json`, but the real defense is keeping them under
`~/.config`.

### Granting the first app-admin

The account must have signed into the deployed app once (so its Auth user
exists). Then:

```bash
pnpm grant:admin:dev  --email you@example.com            # dev, no confirmation
pnpm grant:admin:beta --email cultuvilla.app@gmail.com --yes   # beta/prod need --yes
pnpm grant:admin:prod --email cultuvilla.app@gmail.com --yes
```

The grant is idempotent; `--revoke` removes it. After it lands, that account
sees "Administración" in the app and the rest of the bootstrap (activate
villages, approve organizer/org requests) is done in-app.

## Firebase Auth providers — keep parity

Auth providers must match across envs or sign-in will break in one of them.
Currently enabled on `villa-events`:

- Email/Password
- Google

When provisioning each new project (`cultuvilla-beta`, `cultuvilla-prod`),
enable the same set. For Google sign-in specifically, the OAuth client ID
will differ between projects — that's expected and managed transparently
by Firebase Auth.

### Authorized domains

Firebase Auth only honors OAuth/sign-in redirects to domains in its
**Authorized domains** list. All three projects share the same baseline:

- `localhost` (default)
- `<project>.firebaseapp.com` (default)
- `<project>.web.app` (default)

When apex production / beta custom domains land, add them here too.
Configurable via Firebase console → Authentication → Settings →
Authorized domains, or the Identity Toolkit Admin REST API
(`PATCH /admin/v2/projects/{id}/config?updateMask=authorizedDomains`).

## Setting up a new Firebase project (beta or prod)

1. Firebase console → Add project → name it (`cultuvilla-beta` /
   `cultuvilla-prod`).
2. **Firestore** → Create database → Production mode → region
   `europe-southwest1` (Madrid). Region is permanent.
3. **Storage** → Get started → same region.
4. **Authentication** → enable Email/Password and Google providers.
5. **Project settings → General → Your apps → Add Web app**
   (`cultuvilla-web`). Copy the 6 SDK config values.
6. **Upgrade to Blaze plan** (Project settings → Usage and billing).
   Required for Cloud Functions.
7. Fill the corresponding `FIREBASE_*_<ENV>` vars in `apps/mobile/.env`
   on each deployer's machine.
8. (Recommended) **Budget alerts** in GCP Console → Billing → Budgets &
   alerts. €10–€20/month with thresholds at 50/90/100% is plenty for a
   pilot.
9. **Seed municipalities** (script-only, see *Seeding data*) so there are
   villages to activate.
10. **Grant the first app-admin** (script-only, see *Admin-SDK credentials*).
    From there, everything else is done in-app.
