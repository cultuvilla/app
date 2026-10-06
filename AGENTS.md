# AGENTS.md

The authoritative guide for anyone (human or AI) modifying this repo. Short, opinionated, load-bearing. When this file disagrees with code, the file wins — fix the code.

## What this project is

Cultuvilla is a mobile-first web app for Spanish village communities. Organizations (ayuntamientos, peñas, asociaciones) publish events; residents and visitors discover them, sign up themselves and family members ("personas"), and village admins manage invites and org approvals.

Design work lives under [docs/plans/](docs/plans/) by lifecycle stage (`ideas/` → `ready/` → `ongoing/`); durable rationale for shipped work is distilled into [docs/decisions/](docs/decisions/). **The code is the source of truth for *what* exists**; this file is the source of truth for *how* to build. See the `managing-plans-lifecycle` skill for where a given doc belongs. There is no `docs/superpowers/` or `docs/archive/`.

The **business** side — funding calls, encuentros, collaborators, the pueblo/fiestas market research, the legal entity, and the founders' panel — lives in the **private** [cultuvilla/business](https://github.com/cultuvilla/business) repo, not here. The boundary is one question: *would this still be true if the codebase were deleted and rewritten tomorrow?* If yes, it belongs there. This repo is public, so anything a funder, collaborator or co-founder would not want published never lands here.

The one seam between the two is the snapshot: the business repo's deploy writes it to `_admin/businessSnapshot` on the dev project, and [getBusinessSnapshot](functions/src/business/getBusinessSnapshot.ts) serves it to app admins. That callable owns only the access check — the snapshot's shape is the business repo's.

## Sibling repos

The `cultuvilla` org is checked out side by side under one folder, each repo in a
folder prefixed with the org so a terminal or editor title says which one you
are in:

```bash
git clone git@github.com:cultuvilla/app.git      ~/githubs/cultuvilla/cultuvilla-app
git clone git@github.com:cultuvilla/business.git ~/githubs/cultuvilla/cultuvilla-business
```

So the other repo sits next to this one —
relative to the **main checkout**, not to a worktree. Start a session in the repo
the work belongs to, never in the parent folder: a session loads only its own
repo's rules, skills and memory.

- `../cultuvilla-business` — **private**: the business record and the founders' panel. Read
  it when a task needs it (`claude --add-dir ../cultuvilla-business`); never copy its facts
  into this public repo — not into code, docs, commit messages or PR bodies.
  Edit it only from a session started there, under its own `AGENTS.md`.

## Repo health beats every rule below

If a rule here makes the repo worse for a specific change, break the rule and update this file in the same PR. Rules exist to keep the codebase coherent, not to be obeyed mechanically.

## Architecture invariants

### 1. Service-layer ownership

Components, pages, and hooks **must not** import from `firebase/firestore`, `firebase/storage`, `firebase/functions`, or `firebase/auth` directly. All Firebase access goes through a service in [packages/shared/src/services/](packages/shared/src/services/). See [_services-map.md](packages/shared/src/services/_services-map.md) for the catalogue.

- Need `GeoPoint`, `Timestamp`, or the `User` type? Import from `@cultuvilla/shared/firebase` (the shared package re-exports them).
- The **only** exempt file is [apps/mobile/lib/auth/AuthContext.tsx](apps/mobile/lib/auth/AuthContext.tsx) — it owns the auth boundary (sign-in/out, listeners). Everything else routes through services.
- **Services import Firebase from the SDK seam** ([packages/shared/src/firebase/sdk/](packages/shared/src/firebase/sdk/README.md)), never `firebase/*`. On device the seam resolves to `@react-native-firebase/*` — the persistent offline cache, and the native Auth session the other SDKs authenticate with; Node tests resolve it to the JS SDK against the emulators. A lint rule forbids direct imports, and `sdkParity.test.ts` fails when a name the code imports is missing from a `.native.ts` twin. Compare error codes with `firebaseErrorCode()` — the two SDKs prefix them differently.

`packages/shared` and `functions/` are ESLint-gated ([packages/shared/eslint.config.mjs](packages/shared/eslint.config.mjs), [functions/eslint.config.mjs](functions/eslint.config.mjs)); `apps/mobile` has no ESLint config yet, so there the rule is convention — don't import `firebase/*` from a screen, add a service instead.

> **See also:** the `touch-service` and `guardrail-enforcement` skills for the procedures.

**Why:** Firebase SDK calls scattered through UI code are the #1 source of duplicate reads, missing security checks, and broken offline behaviour. One place per collection. One place to add caching or migrate when needed.

### 2. Shared types, shared models

Anything that crosses workspace boundaries — between the mobile app and functions — lives in [packages/shared](packages/shared). Domain types live under `src/models/`, organized by entity (event, village, person, etc.). Services consume models, never the reverse.

### 3. First-class top-level collections, scoped by `municipalityId`

Single Firebase project. Domain entities (`events`, `organizations`, `persons`, `occupations`, news, …) live at the **top level** of Firestore and carry a `municipalityId` field that scopes them to a village. The only nesting we keep is for data that is genuinely owned by a parent doc (e.g. `municipalities/{id}/members/{userId}`, `organizations/{orgId}/members/{userId}`, `events/{eventId}/registrations/{regId}`, `users/{uid}/notifications/{nid}`).

**Municipality vs. village** — these are two layers of one entity, not synonyms: `municipality` = the physical INE doc and all identity/foreign-key/storage names (`municipalityId`, `municipalities/{id}/…`); `village` = that municipality once its `community` overlay is activated, and all community-facing display names (`villageName`, `VillageMemberData`, `syncVillageDenormalization`). Read [docs/architecture/municipality-vs-village.md](docs/architecture/municipality-vs-village.md) before adding a field or collection that touches either word.

This is the result of the migration recorded in [docs/decisions/open-feed-architecture.md](docs/decisions/open-feed-architecture.md): top-level keeps cross-village/global queries trivial, leaves the door open to multi-village orgs, and removes most of the collection-group indexing burden. Indexes on `municipalityId + <sortField>` (and similar single-collection composite indexes) are declared in [firestore.indexes.json](firestore.indexes.json) and must be added in the same change as a new query shape.

> **See also:** the `add-firestore-collection` skill for the multi-file checklist when adding a new collection.

### Request types (solicitudes)

Three user-initiated requests exist. They surface in the **Buzón** (mobile):
*Necesita tu acción* lists what you can resolve, scoped to what you administer,
and the activity feed shows the requests you've sent while they're pending.
Requests are created from in-context screens; outcomes arrive as notifications.

| Request | Collection | Created by | Approved by |
|---|---|---|---|
| Organizer (be the pueblo's **Embajador**) | `organizerRequests/` | any user | super admin (`respondToOrganizerRequest` callable) |
| Organization (create peña/asociación/ayuntamiento) | `organizations/` (status `pending`) | village member | village admin (own village) or super admin (`approveOrganization` callable; `rejectOrganization` stays a client write) |
| Join an `approval` org | `organizations/{orgId}/joinRequests/{uid}` | any user | org admin, admin of its village, or super admin (`respondToOrgJoinRequest` callable) |

**Joining a peña/asociación depends on its `joinPolicy`.** An `open` org (the
default) is instant self-service: the org detail FAB does a direct client write of
`organizations/{orgId}/members/{uid}` (role `member`, function-owned), and a user
may add only themselves, mirroring village join. An `approval` org takes a join
request instead (table above). **Private events require an `approval` org**:
anyone can walk into an open one, so its membership vets nobody. Read
[docs/decisions/org-join-policy.md](docs/decisions/org-join-policy.md).

**Membership roles & the audit log.** Villages and orgs are the same abstraction —
a membership group with members that carry a `role` and one *founder*. Authority is
ALWAYS the role flag, never the founder pointer:

- **Village:** members at `municipalities/{id}/members/{uid}` with `role: 'admin' | 'user'`.
  `community.organizerId` is the pueblo's **Embajador** — a single, nullable pointer
  (`null` during the wiki phase, where any member may edit basic info). It grants no
  authority of its own and it is **not** "the admin": a village can have many admins.
  **User-facing names differ from code names on purpose:** the pointer's holder is
  the *Embajador/Embajadora de Cultuvilla* (gendered from `community.organizerSex`),
  every other admin is *Equipo del pueblo*. Never say "administrador" or
  "organizador" for the village role in copy; keep the identifiers. The title moves
  only via `transferVillageAmbassador`. Read
  [docs/decisions/embajador-title.md](docs/decisions/embajador-title.md).
- **Org:** members at `organizations/{orgId}/members/{uid}` with `role: 'admin' | 'member'`;
  `requestedBy` is the founder, seeded as admin on approval.

`role` is **function-owned** — clients cannot write it. New admins are created (and
demoted) only through the audited callables **`changeVillageMemberRole` /
`changeOrgMemberRole`**, which verify authority, mutate the role, and append to the
append-only **`membershipEvents/`** log (top-level, scoped by `municipalityId`,
readable by the village/org admins) in one transaction. Organizer approval and org
approval also emit events. Village/app admins are the backstop.

### 4. Denormalized read models for high fan-out

When a query would require N reads or live across collection boundaries, write a denormalized read model and keep it in sync via a Cloud Function trigger. See [docs/architecture/denormalized-read-models.md](docs/architecture/denormalized-read-models.md) for the pattern; [functions/src/village/syncVillageDenormalization.ts](functions/src/village/syncVillageDenormalization.ts) is the canonical example.

> **See also:** the `denormalized-read-model` skill for the step-by-step.

### 5. Strict TypeScript

`strict: true` everywhere. No `any`. No `@ts-nocheck`. If a type is genuinely unknown at the boundary, use `unknown` and narrow. `@typescript-eslint/no-explicit-any` is an error in `packages/shared` and `functions`; the same standard applies in `apps/mobile` even though it isn't lint-gated yet — fix at the source, never silence with `as any`.

### 6. The app is the product; the web is a read site

iOS and Android are the product. Every capability — writes, accounts, offline,
push — is built for the app only, and web never shapes an app API or the app's
data layer.

The web's one job is the **anonymous reader** — the WhatsApp link recipient and
Google search. Every public read route must resolve on web, permanently: share
previews and the printed `/descarga` QR depend on it. Actions on web are app
calls-to-action (universal link, store fallback), not flows.

The web is the **read site**: the `readSite` Cloud Function
([functions/src/web/](functions/src/web/)) server-renders every public page,
and Hosting serves only its static files (`web/`). `apps/mobile/` builds for
iOS and Android only — no Expo web export, no `.web.*` files, no
`Platform.OS === 'web'` branches. A new entity needs a read page there as well
as its app screen.

Read [docs/decisions/web-is-a-read-site.md](docs/decisions/web-is-a-read-site.md)
before adding anything to the web, or proposing that web sign-up return.

## Conventions

### Forms

Currently controlled inputs with `useState`. No form library yet. New forms should match the existing style until/unless we adopt `react-hook-form + zod` (see CHANGELOG — this is on the table).

### Entities

An **entity** is a village-scoped domain object that appears in a horizontal
`Section` scroll (as a `BigCard` / `EntityCard`) and opens a hero-image detail
screen. The family: **event, festival-poster (cartel), place, barrio,
organization, news**, plus **history entry**, which opens the same hero-detail
screen but is listed on the village's timeline rather than in a `Section`
scroll. `person` and `village` are **not** entities — they open into forms
(`ScreenHeader`), not hero-detail screens.

Every entity detail screen is a thin consumer of one scaffold,
[apps/mobile/components/feature/EntityDetailScaffold.tsx](apps/mobile/components/feature/EntityDetailScaffold.tsx):
a solid static top bar (`EntityDetailHeader` — back + action icons) above a
full-bleed flyer (`DetailHeroImage`), then title + body. Don't hand-roll a
detail screen; add a scaffold consumer. The term is also carried by
`EntityCard` and `useEntityCapabilities`; the per-kind fallback icon lives in
[apps/mobile/lib/entities/registry.ts](apps/mobile/lib/entities/registry.ts).

### State and data fetching

React Context for cross-tree state (auth, village). No global store, no query cache: the cache is Firestore's own persistent one on the native SDK. A screen reads through a service's `watch*` function and `useWatch` (`apps/mobile/lib/hooks/useWatch.ts`), so it paints from the device and stays live; a `get*` read plus a `useFocusEffect` reload is the legacy shape, kept only for per-user data not yet moved. Don't roll your own cache — see [docs/plans/ongoing/offline-first-village.md](docs/plans/ongoing/offline-first-village.md).

### Styling

Tailwind v3 via NativeWind v4, with a JS-based `tailwind.config.ts` ([apps/mobile/tailwind.config.ts](apps/mobile/tailwind.config.ts)).
**Design tokens live in `@cultuvilla/shared/design-system`** and feed
Tailwind's `backgroundColor` / `textColor` / `borderColor` / `boxShadow` /
`borderRadius` / `spacing` / `fontSize` / `zIndex` extensions. New code
must use semantic Tailwind classes (`bg-surface`, `text-primary`,
`rounded-md`, `shadow-sm`, `text-body`, etc.) — not raw Tailwind palette
names (`bg-white`, `text-gray-900`). Existing screens still use raw
classes; migration is opportunistic, not mandatory.

When a screen needs a raw numeric value (computed style, RN inline style),
import directly from the design-system: `spacing[4]`, `iconSizes.md`,
`elevation.sm.rn`. See [packages/shared/src/design-system/README.md]
(packages/shared/src/design-system/README.md) for the full token vocabulary.

**Primitives** live under
[apps/mobile/components/primitives/](apps/mobile/components/primitives/) —
`Screen`, `HStack`, `VStack`, `Text`, `Pressable`, `Button`, `Card`,
`Input`, and more. New screens compose primitives; an inline RN `<View>` +
NativeWind class is fine where a primitive doesn't fit, but reach for the
primitive first.

Icons: `@expo/vector-icons` (`Ionicons`). Pass
`iconSizes.sm | md | lg` for size — no ad-hoc `size={18}`.

### i18n

Messages live in [@cultuvilla/i18n](packages/i18n/) and are consumed by the
mobile app via the thin `useT()` adapter in
[apps/mobile/lib/i18n.tsx](apps/mobile/lib/i18n.tsx). User-facing strings go
through `useT()`; hardcoded Spanish is allowed only in dev-only admin
surfaces where i18n is not a current priority.

Locale formatting (`formatDate`, `formatPrice`, `formatRelativeTime`)
lives in `@cultuvilla/shared/utils/format.ts`, preset to `es-ES`. Never
call `Intl.DateTimeFormat` or `Intl.NumberFormat` directly in screens —
the formatter is the single point of locale truth.

### Storage triggers

A Cloud Storage trigger (`onObjectFinalized`, …) has two prerequisites that a
Firestore trigger does not, and getting either wrong fails the **entire**
`firebase deploy` — so one bad Storage trigger blocks every other function from
shipping.

1. **Pin the region to the bucket's.** Functions default to `us-central1`; the
   default bucket in all three envs is **`us-east1`**. A mismatch fails with
   "A function in region us-central1 cannot listen to a bucket in region
   us-east1". `generateImageVariants` declares `region: STORAGE_BUCKET_REGION`
   and a test asserts the resolved `__endpoint.region`.
2. **The GCS service agent needs `roles/pubsub.publisher`** on the project
   (Storage → Eventarc). The deploy service account deliberately lacks the
   permission to grant this itself, so the deploy stops with "We failed to
   modify the IAM policy for the project" and prints the exact command.

The grant is **already applied to dev, beta and prod** — it is one-time per
project, not per trigger, so a new Storage trigger needs only rule 1. Should a
fourth environment ever appear, the agent is created lazily and does not exist
until asked for, which makes the binding fail with "Service account … does not
exist" on a fresh project. Provision it first:

```bash
gcloud storage service-agent --project=<project>   # creates + prints the agent
gcloud projects add-iam-policy-binding <project> \
  --member=serviceAccount:service-<projectNumber>@gs-project-accounts.iam.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

Also: `sharp` is **external** in [functions/esbuild.config.mjs](functions/esbuild.config.mjs).
It is a native module, and bundling it emits a `createRequire(import.meta.url)`
call into CJS output that throws at load — which the emulator reports only as
"codebase could not be analyzed successfully", with every unrelated trigger
silently absent. Any other native dependency needs the same treatment.

### Cloud Functions logging

Cloud Functions write to Cloud Logging. **Never use `console.*`** — `console.log("foo " + bar)` produces an unstructured `textPayload` that filters and dashboards can't query. Use the v2 logger instead, with a structured second arg:

```ts
import { logger } from 'firebase-functions/v2';

logger.info('Migrated persons', {
  handler: 'onOccupationProposalApproved',
  proposalId,
  pendingOccupation: name,
  migratedCount: snap.size,
});
```

> **See also:** the `cloud-function-logging` skill for the rationale and severity guidance.

The second arg becomes searchable `jsonPayload` fields in Cloud Logging. Always include a `handler` field so you can filter by Cloud Function name. Use `logger.warn` for recoverable anomalies and `logger.error` only when the function bails out unsuccessfully.

This rule is enforced by [functions/src/__tests__/helpers/no-console.test.ts](functions/src/__tests__/helpers/no-console.test.ts) — any `console.*` call under `functions/src/` (outside `__tests__/`) fails the build.

### File naming

- React components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Services and models: `camelCaseService.ts`, `entityName.ts`
- Test files: colocated as `*.test.ts`

### Commit messages

Conventional commits, enforced by commitlint:

```
feat(scope): short imperative summary
fix(scope): ...
refactor(scope): ...
docs(scope): ...
chore(scope): ...
ci(scope): ...
```

Header ≤ 100 chars. Direct-to-`develop` is fine for small self-contained changes; `beta` and `main` advance only via promotion PRs (see the branch model under Development workflow).

### Versioning & releases

- **Both stores are published.** iOS 1.0.0 was accepted by App Review on 2026-09-04; Google approved the Play production release (1.1.0, submitted 2026-09-08) and the listing went public by 2026-09-28. Both URLs are in `APP_STORES`, and `pnpm check:store-claims` verifies each listing is public. Web (today the Expo web export → Firebase Hosting, moving to a separate read site) deploys on every promotion — see [invariant 6](#6-the-app-is-the-product-the-web-is-a-read-site). See [docs/plans/ongoing/store-release.md](docs/plans/ongoing/store-release.md) for the runbook and the current state of the external (Play Console / App Store Connect) side. Store **binaries**: a merge to `beta` builds the **Cultuvilla Beta** Android app (`com.cultuvilla.app.beta`) onto its own Play **internal** track, and the prod bundle to **TestFlight** (every internal and external group; external ones via an automatic Beta App Review) ([beta-build-and-submit.yml](.github/workflows/beta-build-and-submit.yml)); **production follows the `beta → main` merge automatically** ([production-release.yml](.github/workflows/production-release.yml)): when the merge bumps the version, and once the prod backend deploy is green, Android builds the `production` profile onto the Play **production** track and iOS submits the TestFlight build of that version for App Review. Merging that PR is the human gate — decided 2026-10-06, see [docs/decisions/production-auto-release.md](docs/decisions/production-auto-release.md). Stop it per merge with `[skip-store]` in the merge commit, or with the repo variable `STORE_RELEASE_PAUSED=true`. The **JS bundle** is a separate matter — see *OTA updates* below.
- **The Android beta is its own Play app, released automatically from `beta`.** Play serves a tester the highest version code across every track they joined, so shipping the prod package to a testing track put every tester on a testing build of the public listing. Instead `beta` builds the **`beta` EAS profile** (package `com.cultuvilla.app.beta`, "Cultuvilla Beta", Firebase `cultuvilla-beta`) and submits it to *that* app's **internal** track — it installs next to the store app, like Órdago's. The prod package reaches Play only from `main`: production-release.yml on a version-bumping merge, or a manual `mobile-release` dispatch (testing tracks, rebuilds, resubmits). iOS keeps building `production` for TestFlight, since TestFlight and the App Store share one install per bundle id. Read [docs/decisions/beta-is-its-own-play-app.md](docs/decisions/beta-is-its-own-play-app.md).
  - It needs `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` as a **repo-level** secret and fails fast with a pointer to the runbook when it is absent.
  - **Freeze Play with the repo variable `PLAY_SUBMIT_PAUSED=true`, never by disabling the workflow** — the Android jobs skip (beta and production alike) and TestFlight and the App Store keep flowing. Disabling it for the 2026-09 Play review silently stopped iOS beta builds too. On a production release this splits the stores, and the run warns about it. The skipped Android release does not come back when the variable is unset: re-run that *Production release* run, or dispatch `mobile-release` (track `production`).
  - **iOS production ships the build testers ran.** On the `beta → main` merge, production-release.yml runs `appstore-release.mjs submit` with no build number, which picks the newest TestFlight build of the `app.config.ts` version and submits it for App Store review (a no-op if that version is already submitted). Actions → *App Store release* → `submit` is the same thing by hand; `mobile-release` (platform=ios) stays as the rebuild escape hatch. That App Store submission closes the version to Beta App Review, so external testers only ever get a version *before* it is sent to the App Store — which the beta → prod order gives for free.
  - It deliberately declares **no GitHub `environment`**: the `Production` environment's branch policy allows only `main`, so naming it from a `beta` trigger would be rejected before any step ran.
  - Locked by [storeRelease.test.ts](packages/shared/test/ci/storeRelease.test.ts).

- **OTA updates (`beta` and `production`).** A merge to `beta` publishes the JS bundle to the `beta` EAS Update channel via [mobile-ota.yml](.github/workflows/mobile-ota.yml), and a merge to `main` publishes it to `production` (production-release.yml calls the same workflow once the prod backend deploy is green; docs/.github-only pushes skip it), so a fix reaches apps that are **already installed** instead of waiting for a store binary. It exists because of a concrete failure: a native-only layout bug (`h-full` on `DetailInfoCard`) was fixed the same day it was reported and still could not reach a single user — the newest binary was four days old, there was no channel, and `mobile-release` had no Play credentials.
  - **`runtimeVersion` is `fingerprint`, never `appVersion`** ([app.config.ts](apps/mobile/app.config.ts)). We bump the MINOR on every `develop → beta` promotion, so an `appVersion` policy would strand each update against the binaries already installed — silently recreating the problem OTA solves. Locked by [otaUpdates.test.ts](packages/shared/test/ci/otaUpdates.test.ts).
  - **The fingerprint must survive a release, and two things used to break it.** @expo/fingerprint hashes the marketing `version` by default, so every bump minted a new runtime; [fingerprint.config.js](apps/mobile/fingerprint.config.js) skips `ExpoConfigVersions` (safe: build numbers are EAS-remote). And `eas.json` is itself fingerprinted, so CI patches the ASC key ids into it only **after** `eas build` has uploaded the project — never before. Both are locked by otaUpdates.test.ts. Binaries built before 2026-10-06 carry the old fingerprint and get no update; check a specific one with `eas fingerprint:compare --build-id <id> --environment production`.
  - **OTA carries JS and assets, never native code.** Adding a config plugin or a native module changes the fingerprint, and EAS then correctly refuses to serve the update to older binaries. Those changes still need `mobile-release` (and the `expo-native-rebuild` skill).
  - **`production` is automatic on `main`** since 2026-10-06; merging the promotion PR is the release decision. Stop one with `[skip-ota]` in the merge commit or the repo variable `PROD_OTA_PAUSED=true`. A manual `workflow_dispatch` on mobile-ota.yml still publishes to any channel.
  - **A binary only receives updates if it was built after `expo-updates` landed** and its profile names a channel (all of `preview-dev` / `beta` / `production` do). Testers on an older build need one manual install before OTA reaches them at all.

- **Deep links:** the per-env association files (`web/well-known/{env}/{apple-app-site-association,assetlinks.json}`) are copied into place at hosting-deploy time by `scripts/build-web-static.mjs`. Signing identities are **committed** there, not injected from CI — they ship in a world-readable file, so there is nothing to hide, and a value in git is reviewable and identical for a local deploy. `prod` carries the real Apple Team ID and the Play **app signing** SHA-256 (Play re-signs every AAB, so it is never the upload key); `dev` and `beta` still hold `REPLACE_SHA256_FINGERPRINT_*` and get theirs when those builds are distributed. An env with a placeholder simply opens the read site instead of the app — expected, not a bug. What must always work is that every deep link resolves on the **read site** too (each share URL, including invite `…/unirse` paths, needs a route in [functions/src/web/routes.ts](functions/src/web/routes.ts) and a screen under `apps/mobile/app/**`). URLs are Spanish and village-first (`/<pueblo>/evento/<titulo>_<id>`), built only by `packages/shared/src/utils/urls.ts` — read [docs/decisions/spanish-village-urls.md](docs/decisions/spanish-village-urls.md) before adding a route; a new top-level route must also be added to `RESERVED_ROOT_SEGMENTS` (Hosting sends every page to `readSite`, which answers reserved segments with the app hand-off). **Prod's AASA deliberately lags:** it claims only the legacy paths the live iOS 1.0.0 binary can route (it predates OTA), until an iOS build with the village-first routes is on sale — see that decision record before widening it.
- **Marketing version** (`app.config.ts` `version`, semver `MAJOR.MINOR.PATCH`) is the single source of truth; `apps/mobile/package.json` mirrors it. MAJOR = redesign/breaking migration, MINOR = new feature, PATCH = fixes.
- **The bump follows the commits since beta:** any breaking change (`type!:` or a `BREAKING CHANGE:` footer) → MAJOR, any `feat` → MINOR, otherwise PATCH. `pnpm release:cut` proposes it; `--bump=` / `--version=` override when the release is a product call (a MAJOR always is).
- **Cut a release with `pnpm release:cut`** (the `prepare-release` skill drives it; beta = release candidate, and the version rides unchanged into `main`). One command: it commits the bump (`app.config.ts` + `package.json` + the CHANGELOG stamp) on top of `origin/develop` and **pushes it to develop** — so develop's version is always the latest cut, with no second PR — then branches `release/X.Y.Z` from it, merges `origin/main` in (beta and main are `strict`, and beta → main merge commits never reach develop), and opens the PR into beta titled `X.Y.Z` with the CHANGELOG section and a `**Migration:**` checklist. `--dry-run` shows all of it without writing. Build numbers auto-increment (EAS `appVersionSource: remote`). **CI enforces the shape** in `.github/workflows/version-gate.yml`: a PR into `beta` must bump `version` above beta's, come from `release/<that version>` and be titled with the bare version; a PR into `main` must come from `beta`.
- **`beta → main` opens itself.** Once a push to beta has a green *Deploy beta* and a green *beta-build-and-submit*, [promote-to-main.yml](.github/workflows/promote-to-main.yml) opens (or refreshes) the `beta → main` PR, titled `X.Y.Z`, with the same checklist and links to those runs. It never merges — the user does. It uses a `RELEASE_PR_TOKEN` secret when set, else `GITHUB_TOKEN`, which can only open PRs while *Settings → Actions → Allow GitHub Actions to create and approve pull requests* is on; the run fails with the manual `gh pr create` command otherwise.
- **The version-bump commit message is the bare version string** — `0.10.0`, not `chore(release): 0.10.0`. commitlint (`commitlint.config.cjs`) has an `ignores` rule that exempts exactly a `X.Y.Z` header; every other commit still follows conventional commits. `pnpm release:cut` writes it; the bump commit contents are `apps/mobile/app.config.ts` + `apps/mobile/package.json` + the `CHANGELOG.md` stamp.
- **`latest` is what the STORE serves, and only the announce poller moves it.** `config/appVersion.<platform>.latest` is the single source of truth — there is no copy in the repo (`APP_STORE_VERSIONS` was deleted 2026-10-06: a constant someone had to edit the day a build went live went stale). The prod deploy records the release at `_admin/announce/pending/prod`; [announce-when-live.yml](.github/workflows/announce-when-live.yml) asks Play and App Store Connect every 30 minutes and moves each platform's `latest` the first tick its store serves the version (Play `production` completed at full rollout for 48 h — Play reports `completed` before its review ends, so it soaks; App Store `READY_FOR_SALE`). It is deliberately **not** the `app.config.ts` version: announcing the repo's version made prod say `1.3.0` while the App Store served `1.2.2`, nudging every iOS user towards nothing. A platform with nothing announced reads `0.0.0`, which nobody is ever behind. A store that cannot be asked (missing or malformed secret, API error) counts as not live, with a warning. A held backend is cleared only by its own successful deploy, and a dispatched `backend_sha` must already be on `main`. `pnpm check:store-claims` compares prod's iOS `latest` against the live App Store. Read [docs/decisions/announce-when-live-poller.md](docs/decisions/announce-when-live-poller.md).
- **The wall (`minSupported`) is raised by the release that needs it, once the stores can serve it.** A `Breaking-Client:` trailer on any commit since the previous `vX.Y.Z` tag makes a production release breaking: its deploy **holds Cloud Functions and rules** (indexes and hosting still ship, the store binaries still ship, the production OTA does not), and once **both** stores serve it the poller raises `minSupported` to that version and then dispatches the held backend (`deploy-prod.yml` with `backend_sha`, pinned to the release commit). `[auto-deploy]` in the merge commit overrides the hold. Beta never holds. A wall is never written above what a store serves — the write is refused.
- **Every deploy rewrites `config/appVersion` but moves nothing.** The last step of [deploy-firebase.yml](.github/workflows/deploy-firebase.yml) runs `seed-app-version-config.mjs --env=<alias> --confirm` on every env to keep the doc well-formed; blank `latest` and blank `min_supported` both **preserve** what is stored, so a merge can neither announce a version nor move the wall.
  Reach for **Actions → "Set App Version"** ([set-app-version.yml](.github/workflows/set-app-version.yml)) only to write a value nothing else will: a wall the trailers did not declare, or an out-of-band correction to `latest` (an explicit `--latest` sets both platforms). It is keyless via WIF and dry-run by default; a prod run is the user's call for that run. Locally the same script is `node scripts/seed-app-version-config.mjs --env=<env> [--latest=] [--min=] [--dry-run] [--confirm]`.
- **The `vX.Y.Z` tag is created by CI**, by the `tag` job in [deploy-prod.yml](.github/workflows/deploy-prod.yml), once the prod deploy is green — so a tag always names a commit that actually shipped. Don't tag by hand. It reads the version from `apps/mobile/package.json` and is idempotent, so a re-run (transient push failure, or re-deploying the same commit) succeeds rather than failing on an existing tag. It cannot retro-tag a release older than the job itself: a re-run uses the workflow file as it was at that commit. `v0.21.0` shipped before this existed and was tagged by hand — the only one.
- **CHANGELOG:** on a cut release, stamp the version into the section heading (`## vX.Y.Z — YYYY-MM-DD`).
- **Force-update gate:** clients read `config/appVersion` on launch (`appConfigService`) and block/nudge via `resolveVersionGate`. When you ship a client-breaking backend change (see *No retrocompat shims*), declare it with a `Breaking-Client:` trailer — that trailer is the decision (`pr:land` hands the PR to the user), and the release then holds its backend and raises the wall by itself, as above.

### Delete > deprecate

If something is unused, delete it. Don't leave dead code, "removed: …" comments, or shim re-exports. Git keeps history; the codebase should reflect the present.

### No retrocompat shims unless asked

When changing the shape of data already in Firestore, surface the migration explicitly:

- Note the affected docs and field(s) in the commit body and the PR description.
- Add a backfill script under `scripts/` when the change can't be expressed as a Cloud Function trigger.
- **Register the backfill so the deploy can enforce it** — see *Backfills* below. A registered backfill declares a `phase`, and `pre-deploy` ones block the promotion until they have actually run against the target env. That, not a doc, is what makes "a backfill is pending" a checkable fact: the completion marker at `_admin/backfills/markers/{id}.{env}` is the source of truth.
- **Also mark it in the CHANGELOG.** Put a `**Migration:**` marker inline in that `[Unreleased]` entry naming the script (e.g. `**Migration:** existing rows are purged by re-running \`scripts/backfill-municipality-people.mjs\` (per env)`). `pnpm release:cut` and `promote-to-main.yml` turn every `**Migration:**` in the stamped version block into a checklist in the `release/X.Y.Z → beta` / `beta → main` promotion PRs. The registry is the *enforcement*; this marker is the human-readable release story that says which data moved and why.
- Don't leave dual-read code, shim re-exports, or `// removed: …` comments. Pairs with the `### Delete > deprecate` rule above.
- If the change breaks older store clients, raise `config/appVersion.minSupported` to the fixed version at release time (see *Versioning & releases*).

Only add a compatibility layer when the user explicitly asks for one (e.g. when an in-flight client release would break without it).

**Installed store clients are the exception, and expand → migrate → contract is the default for them.** Both store apps are published and installed binaries lag the backend by weeks, so a callable, a rule or a stored field an old binary still depends on is kept (dual-written, kept callable) until `minSupported` has passed it — that compatibility window is **not a shim**. The removal is a later *contract* commit, and only that commit may carry `Breaking-Client:` (or `Breaking-Client-Exempt:` once the drain is provably complete). CI's `breaking-changes` job fails an undeclared callable removal and a stored-schema change that tightens without a `pre-deploy` backfill or loosens without a trailer. Read [docs/decisions/breaking-change-and-hard-wall.md](docs/decisions/breaking-change-and-hard-wall.md).

### Backfill dev when a schema field is added

Reads route through a **strict** Zod converter ([makeConverter](packages/shared/src/firebase/converters/makeConverter.ts) → `schema.parse`), so a doc missing a newly-added field makes the converter *throw* and crashes whatever screen reads that collection. When a feature adds or tightens a model field, backfill the existing dev docs (`villa-events`) in the same change — don't leave the field optional just to tolerate stale data (that's a retrocompat shim; see above).

- **Dev and beta backfills are autonomous — no confirmation needed** (see *Approval*). Dev (`villa-events`) and beta (`cultuvilla-beta`) are non-production; an agent may write and run the backfill there directly — dry run first, `--confirm` on beta. Prod stays the user's (CI on promotion, or their explicit go for a specific run).
- Write the backfill as a one-off, idempotent `scripts/backfill-<thing>.mjs` **registered on the harness** (mirror `scripts/backfill-municipality-namelower.mjs`): only patch docs missing the field, set the same default the model builder uses, and give it `phase: 'pre-deploy'` so the promotion to beta/prod blocks until it has run there. See *Backfills* above.
- Verify with **`pnpm check:dev-conformance`** ([scripts/check-dev-conformance.mjs](scripts/check-dev-conformance.mjs)) — it walks every dev collection through its converter and reports nonconforming docs. Run it before and after the backfill. It needs credentials, so it is **not** part of the `pnpm check` CI gate; run it manually against dev after schema changes.
- **Beta/prod are gated automatically, twice.** Every `develop → beta` and `beta → main` deploy runs, *before* any `firebase deploy` and against the target env's live data (via the WIF service account): the **conformance gate** (this same check — does the stored data parse under the shipped converters?) and the **backfill gate** (`pnpm backfills:verify` — has every `pre-deploy` backfill actually run here?). Either one failing blocks the whole promotion instead of shipping a converter crash. See the "Conformance gate" and "Backfill gate" steps in [.github/workflows/deploy-firebase.yml](.github/workflows/deploy-firebase.yml); the wiring is locked in by [conformanceGate.test.ts](packages/shared/test/ci/conformanceGate.test.ts) and [backfillGate.test.ts](packages/shared/test/ci/backfillGate.test.ts). So the practical rule is: backfill the target env before promoting, or the promotion's deploy will block.

- **Backfill the source before the projection, then the projection again.** A projection trigger (`syncMunicipalityPeople`, `syncPersonDenormalization`, …) writes its read model with a full `set()`, not a merge. On beta/prod the *currently deployed* trigger predates the new field, so patching the source collection fires it and it rewrites every projected row **without** the field — silently undoing a projection backfill you already ran. Backfilling `persons.isPublic` on beta wiped the `municipalityPeople.isPublic`/`barrioId` rows it had just written. The deploy can't go first (the gates block on the un-backfilled data), so the order is: **source collection first → let the old trigger clobber → re-run the projection backfills → verify conformance → promote.** Re-check conformance immediately before merging the promotion PR: any write to the source in between re-clobbers the projection until the new trigger is deployed.

### Backfills

A backfill is a script that mutates existing Firestore data to match a schema
change. **Code deploys on merge; data does not** — so every backfill is
registered, and the deploy verifies it actually ran against the env being
promoted to.

Registered backfills live under `scripts/` as a `.mjs` exporting `meta` + `run`:

```js
import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'barrio-resident-count',   // kebab-case; == _admin/backfills/markers/{id}
  kind: 'backfill',              // backfill | cleanup | migration | audit
  description: 'why this exists, in one line',
  phase: 'pre-deploy',           // pre-deploy | post-deploy | none
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'], // envs the deploy runs this on unattended
  dependsOn: [],                 // ids that must run BEFORE this one
};

export async function run({ db, apply, log }) {
  // must honour `apply` — without it the run is a dry run and writes nothing
  return await backfillCollection(db, 'label', db.collection('x'), patchFor, { apply });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
```

**`phase` is the load-bearing field**, and it is about ordering around the
deploy, not about a version. The strict Zod converters make it bidirectional:

| phase | meaning | deploy behaviour |
|---|---|---|
| `pre-deploy` | new code can't read old data (adding a required field) | **blocks** the deploy until the marker exists |
| `post-deploy` | old code can't read new data (dropping a field) | **warns** — blocking would deadlock |
| `none` | never gates (audits; one-offs already run everywhere) | ignored |

**`autoApply` is the default for an additive, idempotent `pre-deploy` backfill
— not the exception.** The deploy applies opted-in backfills itself, first,
before both gates, so the migration and the code that needs it land in one
green run. Leaving it empty means every promotion stops until a human dispatches
"Run Backfill" per env — and it stops *badly*: the deploy fails at the gate,
someone runs the script, someone re-runs the deploy. The 0.21.0 release did that
twelve times for six purely additive migrations. `pnpm backfills:lint` warns
about an idempotent `pre-deploy` backfill with an empty `autoApply`. Opt out
deliberately (destructive, non-idempotent, or needs a human reading the diff),
not by default.

**`dependsOn` declares run order.** Without it, auto-apply runs in `meta.id`
alphabetical order, which is not a safe order for a **projection**. A backfill
that writes a read model must declare the source-collection backfills it
follows — patching a source fires the currently-deployed trigger, which rewrites
projected rows with a full `set()` that predates the new field and silently
undoes projection work already done. `registration-person-denorm` is the worked
example. A cycle is an error, not a coin flip.

**The marker is the source of truth.** A successful `--apply` writes
`_admin/backfills/markers/{id}.{env}` with `{ completedAt, gitSha, actor, counts }`.
`_admin/**` is denied to all clients in `firestore.rules` (the Admin SDK bypasses
rules); a client-writable marker would let anyone wave a nonconforming schema
through the gate.

**Running one needs no local credentials.** Beta/prod enforce
`iam.disableServiceAccountKeyCreation`, so there is no key to hand out. Use
**Actions → "Run Backfill"** ([run-backfill.yml](.github/workflows/run-backfill.yml)),
which authenticates keylessly via the same WIF service account the deploy uses.
It is dry-run by default, always dry-runs before applying, and is dispatchable
via the GitHub API — so an agent can drive a migration it has no credentials
for. Locally, dev is autonomous; beta/prod need `--confirm`.

```bash
pnpm backfills:list                                   # the registry (no credentials needed)
pnpm backfills:verify --env=beta                      # what the deploy gate checks
pnpm backfills:run --id=<id> --env=dev                # dry run
pnpm backfills:run --id=<id> --env=dev --apply        # writes + records the marker
pnpm backfills:test                                   # registry unit tests
```

**Gotchas.**

- **`_admin` paths need an EVEN number of segments.** `_admin/backfills/markers/{id}`
  (4) is a document; `_admin/backfills/{id}` (3) is a collection and `db.doc()`
  throws on it at runtime.
- **Discovery imports every registered module**, so the `isMain(import.meta.url)`
  guard is what stops `backfills:list` from *running* all of them. It is covered
  by a test that fails if the guard is dropped.
- **`autoApply` opts a backfill into running unattended on every deploy.** Only
  for provably additive, idempotent work — `validateMeta` rejects the opt-in on
  a non-idempotent backfill. It runs **before both gates**, since it writes the
  data the conformance gate reads; that ordering is locked by
  [backfillGate.test.ts](packages/shared/test/ci/backfillGate.test.ts).
- **A backfill only reaches beta/prod once its script is on that branch.** The
  `beta` / `production` GitHub Environments are branch-restricted, so
  `run-backfill.yml` must be dispatched with `ref: beta` / `ref: main` — a
  dispatch from `develop` is rejected in ~2s before any step runs. That is the
  circularity `autoApply` dissolves: the deploy already runs on the right branch
  with the right credentials, so a self-applying migration never needs a
  manual dispatch at all.
- **Six legacy scripts** predate the registry and are not on it.
  `pnpm backfills:lint` warns about them in CI without failing. Convert
  opportunistically; register anything new. The other ~17 were spent one-offs
  and have been deleted (*Delete > deprecate*) — what survives is the set with a
  live pointer: five are the **backfill-of-record** named in
  [denormalized-read-models.md](docs/architecture/denormalized-read-models.md)
  for a read model that could still drift, and one is wired to a `package.json`
  script. Deleting those would throw away the answer to "how do I repopulate
  this?", so retire one only after its entry in that doc goes too.

### Plans carry a metadata block, and the map is generated

<!-- plans:landed -->

Every plan carries the block `managing-plans-lifecycle` defines (agent-plans v2):
`**Priority:**` everywhere, plus `**Landed:** / **Gate:** / **Next:**` once it is in
`ongoing/`. The comment above is the machine-readable switch that makes `Landed`
required here: this repo deploys, and `Landed` (`none | dev | beta | prod | n/a`, the
furthest env where the code is live) is the retirement gate — merged is not verified.
Don't write `Status`/`Stage`/`Updated` lines; the folder and git carry them.

[docs/plans/_plans-map.md](docs/plans/_plans-map.md) is **generated — never edit it,
never commit it from a branch.** [plans-map.yml](.github/workflows/plans-map.yml)
validates every block on a PR and regenerates the map on each push to `develop`.
`pnpm plans:validate` checks your edit locally; `pnpm plans:map` renders it for a
look. The generator is shared (`scripts/plans-map.js` links into `.agents/_shared`).

### Comments

Don't explain *what* the code does — name things well instead. Only comment to explain *why* something non-obvious is the way it is: a security constraint, a Firestore quirk, a workaround for a specific bug.

## Commands

```bash
pnpm install          # workspace deps (functions has its own — npm ci in functions/)
pnpm app:start        # Expo dev server (apps/mobile)
pnpm check            # lint + typecheck + test + build (CI gate)
pnpm lint             # eslint --max-warnings 0 in packages/shared + functions
pnpm typecheck        # tsc --noEmit in shared, functions, i18n, mobile
pnpm test             # vitest (shared) + jest (mobile) + functions, under emulators
pnpm backfills:list   # registered data migrations (see Backfills)
pnpm test:e2e:android # Maestro on an Android AVD, under emulators (needs a device)
pnpm check:store-claims # verify the store-release runbook against live infra
```

Pre-commit (Husky + lint-staged) currently only formats `*.{json,md,yml,yaml}`; commit-msg runs commitlint. The lint/typecheck/test gate runs via `pnpm check` and in CI, not on commit.

### Dev seed data

`pnpm seed:dev` populates the dev Firestore (`villa-events`) with a named dataset from [scripts/data/seed-fixtures/](scripts/data/seed-fixtures/). Each dataset folder is `<name>/fixtures.mjs`, an optional `images.manifest.mjs`, and an `images/` folder whose files get uploaded to Cloud Storage and wired into the seeded docs. The seeders live under [scripts/seed/](scripts/seed/) — one per domain, sharing [scripts/seed/lib/](scripts/seed/lib/); [scripts/seed/all.mjs](scripts/seed/all.mjs) is the orchestrator.

```bash
DATASET=demo_1 pnpm seed:dev          # seed everything (users → villages → orgs → places → events → news)
DATASET=demo_1 pnpm seed:dev:wipe     # remove just that dataset (reverse order)
```

`DATASET` defaults to `demo_1` (the showcase dataset). Requires `GOOGLE_APPLICATION_CREDENTIALS` (same key as the escudos uploader). See `firebase-admin-dev` skill.

Each domain also runs à la carte (resolves its dependencies by email / deterministic ID), e.g. `pnpm seed:dev:news` or `pnpm seed:dev:events:wipe`. Available: `users`, `villages`, `orgs`, `places`, `events`, `news`.

Images are **generated or pre-downloaded once, never fetched at seed time**; either way the results are committed.

- **`demo_1` is drawn, not photographed** — `pnpm seed:images:generate` ([generate-demo-images.mjs](scripts/seed/generate-demo-images.mjs)) renders every asset as a flat brand-coloured card carrying a glyph for what it depicts. It replaced Lorem Picsum because random photos were *actively misleading*, not merely generic: "Casa Consistorial" was a person in a beanie and "Ayuntamiento de Aranjuez" was a camera — and those images are what the Play Store screenshots are built from. We cannot license real photos of Aranjuez, so the honest alternative is imagery that is obviously illustrative. Output is deterministic (palette from a hash of the filename), so re-running makes no diff.
- **Other datasets still download** — `DATASET=real_villages_1 pnpm seed:images` reads that dataset's `images.manifest.mjs` ([prepare-images.mjs](scripts/seed/prepare-images.mjs)) and resizes with sharp.

Image-capable entities: user/persona photo, village escudo, barrio, place, organization, event `imageURL`, news `images[]`.

To activate real villages via the **actual organizer-request → admin-approval flow** (rather than direct seeding), use the sibling script:

```bash
DATASET=real_villages_1 pnpm seed:villages          # default DATASET
DATASET=real_villages_1 pnpm seed:villages:wipe
```

It assumes `pnpm seed:dev` has been run (so the requester + approver users exist) and `pnpm seed:municipalities` has been run (so the target municipality with the matching `codigoINE` exists). Doc writes replay what the `requestOrganizeVillage` / `respondToOrganizerRequest` Cloud Functions do — `organizerRequests` records the audit trail.

### Mirroring a real village into the emulator

`pnpm mirror:village --municipality=<id|name>` copies one village's data from a
real environment into the **local emulator**, so a feature can be developed
against real shapes, counts and distributions instead of invented fixtures.
Reads are read-only and default to prod; writes only ever reach an emulator.

```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
pnpm mirror:village --municipality=Matabuena --dry-run   # counts, writes nothing
pnpm mirror:village --municipality=Matabuena             # ~1.4k docs
pnpm mirror:village --municipality=Matabuena --anonymize # scrub names/photos/emails
```

**Two guards make it safe to point at prod**, and both must hold: `FIRESTORE_EMULATOR_HOST`
must be set, and the target project id must not be one of the three real ones. A
mirror writes over a thousand documents, so a misconfigured target would not be a
small mistake. They are unit-tested — don't weaken them.

Not a registered backfill: it never mutates a real environment, so there is
nothing for the deploy gate to verify.

**`persons` is reached through the `municipalityPeople` projection**, not a
`municipalityId` filter. A person is linked to a village by `municipalityLinks`,
an array of `{municipalityId, barrioId}` **objects** — Firestore matches an array
element whole, so a field filter returns zero rows silently rather than failing.
Any future collection scoped that way needs the same treatment.

### Previewing a village Wrapped

`pnpm wrapped:preview` renders a village's post-fiestas Wrapped cards to local
image files from real data, read-only — the design loop for the Wrapped, with no
deploy and no emulator.

```bash
pnpm wrapped:preview --municipality=digSmD1NFyaOJCPQ99cC \
  --blocks="Santiago@2026-07-24..2026-07-26|Carmen@2026-08-14..2026-08-28" \
  [--range=2026-07-15..2026-08-31] [--project=cultuvilla-prod] [--out=DIR]
```

It bundles its entry with **the deploy's own esbuild options** (`functions/esbuild.shared.mjs`),
so a preview that renders proves the deployed bundle renders: fonts inlined,
Satori's layout engine bundled, `sharp` external. Keep those options shared —
a preview built differently would prove nothing. Reads use the same ADC as the
mirror (`~/.config/cultuvilla/adc.json`).

### Mobile app

Mobile code lives in [`apps/mobile/`](apps/mobile/). It is an Expo SDK 56 / Expo Router 56 / NativeWind v4 React Native app that consumes `@cultuvilla/shared` and `@cultuvilla/i18n` from the monorepo.

**Boot**

```bash
# JS-only reload (most changes)
pnpm --filter cultuvilla-mobile exec expo start

# If you have a dev-client installed on device/emulator:
pnpm --filter cultuvilla-mobile exec expo start --dev-client

# Remote device (tunnels Metro through Expo's servers):
pnpm --filter cultuvilla-mobile exec expo start --tunnel
```

**Tests / typecheck**

```bash
pnpm app:test                                  # jest suite for apps/mobile
pnpm app:typecheck                             # tsc --noEmit for apps/mobile
```

**Key conventions**

- **Primitives**: `Screen`, `HStack`, `VStack`, `Text`, `Pressable`, `Button`, `Card`, `Input`, and more live under `apps/mobile/components/primitives/`. Compose them rather than dropping to raw `<View>` + NativeWind where a primitive fits.
- **Image uploads**: use `pickImageAsBlob` (returns a `Blob`) and pass it to `imageService`. Never import from `firebase/storage` directly in mobile screens — route through the service.
- **i18n**: add new strings to `packages/i18n/messages/es.json` (nested JSON), consumed via the thin `useT()` adapter in `apps/mobile/lib/i18n.tsx`. Dotted-path lookup works (the adapter walks the object on `.` splits).
- **EAS Build profiles**: `development` / `preview-dev` / `beta` / `production` (defined in `apps/mobile/eas.json`) map to the `villa-events` / `cultuvilla-beta` / `cultuvilla-prod` Firebase environments via `APP_ENV`. Keep them in sync when Firebase config changes. `production` reads its Firebase values from the **EAS `production` environment** (`eas env:list --environment production`), not from `.env` or GitHub — `app.config.ts` is evaluated on the EAS build server.
- **EAS Submit profiles**: `internal` / `closed` / `production` map to the Play tracks `internal` / `alpha` / `production` of **Cultuvilla** (`com.cultuvilla.app`, Firebase `cultuvilla-prod`), used by `mobile-release` and — `production` only — by `production-release` on a version-bumping merge to `main`. `beta` maps to the **internal** track of **Cultuvilla Beta** (`com.cultuvilla.app.beta`, Firebase `cultuvilla-beta`), used by `beta-build-and-submit` on every merge to `beta`. Nothing else reaches a store: `.dev` stays sideload-only, because a new store identity needs its own FCM config, Android OAuth client and App Links host. `cultuvilla-beta` is both the backend staging env (promotion deploys + the conformance/backfill gates) and the beta app's backend. Read [docs/decisions/beta-is-its-own-play-app.md](docs/decisions/beta-is-its-own-play-app.md); locked by [packages/shared/test/ci/storeRelease.test.ts](packages/shared/test/ci/storeRelease.test.ts).
- **App Check**: the `initMobileAppCheck` seam is wired in the app bootstrap but is a no-op. Do not remove it — it will be activated when the product opts in. Leave it untouched unless explicitly asked.
- **Native rebuilds**: after installing a package that ships an Expo config plugin, or after changing the `plugins` array in `apps/mobile/app.config.ts`, run a clean prebuild. See the `expo-native-rebuild` skill.

### Never start long-lived dev servers

You (Claude) **may** run the emulator-backed test suites yourself — they boot
*ephemeral* Firebase emulators via `scripts/run-tests-with-emulators.mjs` and tear
them down when the run ends, so they don't collide with anything. In worktree mode,
prefer targeted tests/typechecks locally and let the PR's CI run the full gate. In
direct-to-`develop` mode, run the full gate locally before committing:

- `pnpm check` (the full gate), `pnpm test`, `pnpm test:emulators`,
  `pnpm test:integration`, `pnpm test:rules`, `pnpm test:functions`

`pnpm test:e2e:android` (Maestro on an AVD) is the same shape but needs a booted
Android emulator, which this environment usually lacks — CI's `android-e2e`
workflow is the authoritative run. See
[apps/mobile/e2e/native/README.md](apps/mobile/e2e/native/README.md); under WSL2
it also needs `EMULATOR_BIND_HOST=0.0.0.0`.

Still off-limits — these run indefinitely (the user owns that iteration loop) or
bypass CI:

- `pnpm app:start` / `expo start` (Expo/Metro dev server)
- `firebase emulators:start` directly (standalone long-lived emulator session)
- Any deploy script (`pnpm deploy:*`) — use the `firestore-deploy` skill instead

If you need output from a long-lived server you can't start (Metro, a standalone
emulator session), ask the user to run it and paste the relevant lines.

## Development workflow

All non-trivial changes follow the same loop. Tiny edits (typo in a doc, a renamed string) can skip steps 1 and 4, but any code change goes through every step.

**Branch model (three-tier):** `develop` → `beta` → `main`, each mapped to a Firebase
environment (dev `villa-events`, beta `cultuvilla-beta`, prod `cultuvilla-prod`).
Merging into a branch auto-deploys backend + hosting to its env via CI — prod
included, with no manual approval step; `main` is production and **forbids direct
pushes** (merge-from-`beta` only). The `production` GitHub Environment still
restricts which branch may deploy (branch policy), but no longer requires a
reviewer. All daily work targets `develop`. See
[docs/decisions/dev-beta-prod-environments.md](docs/decisions/dev-beta-prod-environments.md).

1. **Classify the mode from the diff — never ask.** See the Autonomy contract below.
   - **Direct** — the diff touches *only* `docs/**`, `*.md`, `CHANGELOG.md`, `.agents/**`, `.claude/**`. Commit and push straight to `develop` in the base checkout. No branch, no PR.
   - **Autonomous (everything else)** — branch from the latest `develop` into a worktree under `.claude/worktrees/<short-name>/` and work there. Never edit the base checkout in this mode. Worktrees isolate dependencies, build outputs, and caches so parallel changes don't fight each other, and they make it easy to abandon work that doesn't pan out.

   **The VSCode checkout must always stay on `develop`** — never run `git checkout`/`git switch` to a feature branch in the open editor workspace. A feature branch always lives in its own worktree, created with `git worktree add` and committed to from there, so the VSCode view never leaves `develop`. (Never commit directly to `beta` or `main` — those advance only by promotion PRs.)
2. **Read any in-flight plan** in [docs/plans/](docs/plans/) and the relevant record in [docs/decisions/](docs/decisions/) for the feature area.
3. **Look at the relevant service** in [packages/shared/src/services/](packages/shared/src/services/) before writing UI code; extend the service if the API you need is missing.
4. **Add or extend tests whenever possible.** Tests are the contract that survives refactors and AI rewrites. Specifically:
   - Pure logic, model builders, validation, and service helpers go in `packages/shared/test/` (vitest).
   - New ESLint rules, type-level contracts, or other "this must keep working" invariants get a test that fails if the invariant breaks (see [packages/shared/test/eslint/rules.test.ts](packages/shared/test/eslint/rules.test.ts) for the pattern).
   - If a change is genuinely untestable today (UI-only, no extractable logic), say so in the PR description and explain why.
5. **Keep documentation in sync.** If you add a new collection or denormalized field, update [packages/shared/src/services/_services-map.md](packages/shared/src/services/_services-map.md) and [docs/architecture/denormalized-read-models.md](docs/architecture/denormalized-read-models.md) in the same change. Note user-facing changes in [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]`.
6. **Verify according to the selected mode.** In a worktree, run the relevant targeted tests/typechecks, push promptly, and use the PR's GitHub CI result as the authoritative full `pnpm check` gate — do not duplicate the entire gate locally by default. Direct-to-`develop` has no PR gate, so run `pnpm check` locally before committing.
7. **Open a pull request** targeting `develop` — through `pnpm pr:land` (step 8), which adds the `ai-review` label the reviewer needs; never a bare `gh pr create` without that label. A PR is a written record of what changed and why, and lets CI gate the change before it touches `develop` (and, via promotion, beta/prod). The PR description should cover:
   - **What** changed at a level the future reader needs (not a diff restatement).
   - **Why** it was done — the motivating problem or design decision.
   - **Tests** that were added (or an explicit note if none were possible).
   - **Test plan** as a checklist: targeted local checks, full CI gate, manual verification steps.
8. **Land it with `pnpm pr:land`.** It opens the PR, watches CI, applies the hard-stop rules below, and hands a green PR to the **merge queue** on `develop`, which merges it. Run it, act on the exit code, run it again: `0` merged · `10` CI red · `20` review requested changes · `30` **hand to a human** · `40` preflight failed. Steps 7, 9 and 10 are what it automates — don't hand-roll them. **A green PR merges itself** — see the Autonomy contract for what that bar is and what it deliberately excludes.
9. **Don't rebase to stay current — the merge queue tests the merge.** `develop` requires a GitHub merge queue ([.github/rulesets/develop.json](.github/rulesets/develop.json)): the queue runs the full `ci.yml` gate, emulators included, on your PR stacked on the latest `develop` and on every PR ahead of it, and merges only a green result. That is what catches a refactor that landed under you. Rebase only on a real conflict (`pr:land` exits `40`). Read [docs/decisions/merge-queue.md](docs/decisions/merge-queue.md). (Promotion PRs `develop → beta` and `beta → main` have no queue and still follow a rebase-then-green rule.)
10. **Merge with a merge commit, not squash or rebase.** The queue's `merge_method` is `MERGE`, so it writes one merge commit per PR. Squashing would collapse the carefully-scoped commits in the PR (e.g. "feature" + "test for feature") into one, which makes `git bisect` and `git blame` worse. Rebase-merging hides the PR boundary entirely. A merge commit preserves both.
11. **If you broke a rule in this file deliberately**, update this file in the same PR.

## Approval — what agents start without asking

**`ready/` means approved, not planned.** A plan reaches `ready/` because someone with the authority said *yes, this should exist* — the user, or the standing policy below — and that decision is what the stage records. The File Structure and Tasks are written by the agent that starts the work, against the code of that day: a decision holds for months, while plan facts rot in weeks. **Approve early, plan late.**

**Priority orders the queue; it never gates it.** An approved `low` plan is worked when nothing ranked above it is waiting.

Two shared skills run on this policy: **`advance-plans`** builds the approved pool in parallel — `ongoing/`, then `ready/`, then pre-approved ideas straight from `ideas/` — and **`review-ideas`** verifies ideas against the code and asks the user for the yeses (tagging the pre-approved ones `Pre-Approved: <slug>` so the builder finds them).

**The line is subjectivity** (decided 2026-10-05, adopting ordago's policy). The user's consent is for what is a matter of judgement they hold — product, business, taste — and not for engineering the agents and the tests can verify. So the default for objective work is *do it and report it*, and a new gate needs a subjective reason.

**Free — no approval at all:** read-only investigation and audits (prod reads included), and writing or updating plans.

**Pre-approved — an agent may take these from `ideas/` to merged without asking:**
- fixing a defect whose correct behaviour is not in dispute — a crash, a leak, a wrong result, code that breaks its own docs or tests — unless the fix changes a product rule;
- debt and refactors that change nothing observable (below);
- internal instrumentation and tooling no user sees — telemetry, log severity, diagnostics, scripts;
- test and CI health — flakes, missing coverage, a broken lane;
- docs, plans and comments that contradict the code;
- consolidating duplicates into one source of truth — where the copies disagree, only if the surviving behaviour is the documented or tested one;
- a data migration or backfill that follows from an architectural benefit — a reshaped read model, a dead field, a consolidation. One that implements a product or business decision inherits that decision's yes instead;
- running dev (`villa-events`) and beta (`cultuvilla-beta`) data operations and deploys — backfills, repairs, rules, indexes, functions — dry run and backup first, logged with counts. **Beta is not a sandbox:** it is the backend of the *Cultuvilla Beta* app real testers run, so a beta write is held to a prod-grade dry run. Production (`cultuvilla-prod`) stays the user's.

**Needs the user's yes:** anything a user can see or do differently; a product rule (a limit, a permission, who may do what); anything that adds running cost; removing something a user or any supported client version can reach; a new external service or account. **Unsure which class → it needs a yes.**

What the words mean:
- **Differently** — what a user is shown or allowed changes. The same result, faster or more reliably, does not count: a crash that stops happening is a fix, not a change. A stored shape changing underneath the same experience is engineering — a migration, pre-approved above when it follows from an architectural benefit.
- **Observable / stored data** — any Firestore or Storage field or collection added, removed or reshaped, and any analytics event name or attribute a dashboard reads.
- **Running cost** — a new recurring cost line: a deployed function or trigger, a Cloud resource, a quota, a paid service, a CI job. Marginal reads or bytes per request do not count.

Three rules settle the edges. **A yes written into a plan counts** ("Decided 2026-10-05 (user)") — move that plan to `ready/` when you see it. **A plan's own `Gate` or "do not start until" outranks pre-approval.** **A plan that mixes classes** may land its pre-approved part alone only if that part is useful without the rest; otherwise the whole plan waits for the yes. Pre-approval covers *starting* the work, never merging past a hard stop (Autonomy contract).

**The classifier enforces this for unattended agents.** [.agents/auto-mode.json](.agents/auto-mode.json) restates this section and the Autonomy contract for Claude Code's auto-mode classifier; each person running agents installs it with `pnpm agent:auto-mode --write` (it never reads a repo's own settings). Change both in the same commit — the file is this policy restated, never a looser one.

## Autonomy contract

**The user is a decider, not a merge gate.** A change should cost them two messages: their request, and one decision. The `ship-a-feature` skill owns the procedure — front-load every business and technical question into ONE message with a recommended pick on each, take `go` as "all your picks", then implement and land without check-ins.

- **`ship-a-feature` and `managing-plans-lifecycle` are shared, not local.** `ship-a-feature` is a symlink into the `.agents/_shared` submodule; `managing-plans-lifecycle` is vendored from agent-plans (see `.agents/README.md`). The [agent-skills](https://github.com/alvaro-francisco-gil/agent-skills) submodule is consumed by several repos. **Do not edit them to fix something about this repo** — they carry procedure only. Every Cultuvilla-specific value lives here and in `.agents/land.config.json`. Run `git submodule update --init` after cloning, or the skills are empty.
- **Merge bar: CI green + an approving `ai-review`. The agent merges to `develop` itself** — the user is not the gate (decided 2026-08-22). The reviewer has worked here since 2026-10-06 (powerreviewer reviewed #469), so `requireApprovingReview` is `true` in `land.config.json`; from 2026-08-22 until then the bar was CI alone. A `REQUEST_CHANGES` is a round: fix and re-run `pr:land` (exit `20`). After **3** rounds (`maxReviewRounds`) the review conversation ends and the PR lands on CI green alone (`roundsExhausted: "merge"`) — don't stop to report that. The hard stops below still never self-merge, the vacuous-green guard still refuses to read "no run dispatched" as "tests passed", and `develop` is not a release branch — a bad merge is caught before it reaches `beta`.
- **Always open a PR through `pnpm pr:land`, or add the `ai-review` label yourself.** The reviewer only picks up labelled PRs, and `pr:land` adds the label when it opens one. A PR opened with bare `gh pr create` is never reviewed: PRs #436–#468 went through that way while the merge bar was CI alone. Now that the bar requires a review, such a PR just waits until `reviewTimeoutMs` (40 min) and exits `30`.
- **Reviews reach this repo by poll, and cannot reach it any other way.** ordago gets an immediate trigger from a `request-review` job that calls homelab's reusable workflow. That is impossible here: **this repo is public and homelab is private**, and a public repo cannot call a private repo's reusable workflow. GitHub resolves the callee when it *creates* the run, before evaluating any job-level `if` — so such a job is not inert-until-enabled, it fails the entire workflow to load and takes every other job down with it. Don't add one back; it was tried on 2026-08-22 and run `32594475090` completed with zero jobs. This repo is already registered in homelab's `personal/agent-review.yml`, so the 15-minute poll backstop is the path. The cost is latency, not capability: expect a review within a poll interval, not immediately, and leave `pr:land` waiting rather than re-running it in a tight loop.
- **"No CI ran" is never "CI passed".** `ci.yml` has no `paths:` filter, so every PR here does dispatch a run — `land.config.json` records that as `ciPaths: ["**"]`. If a path filter is ever added, that value must change with it.
- **The merge queue owns staleness, not rebases.** `pr:land` detects the queue on `develop` and enqueues instead of rebasing; a queue failure is retried once, and a second one exits `10`. Rebase only on a conflict. The `sharedBlastRadius` rules in `land.config.json` apply only if the queue is ever switched off.
- **Hard stops — what still goes to the user, and why so little does.** The user's consent covers what is *subjective* (*Approval*), not engineering an agent and the tests can judge. Nothing merged to `develop` reaches beta or prod by itself: rules, indexes and `autoApply` backfills get there only through a promotion PR the user merges. So since 2026-10-05 the `hardStop` path list in `.agents/land.config.json` is **empty**: rules, indexes, converters and backfill scripts merge on CI green + `ai-review` like any other code. `test:rules` and the conformance gates are what actually execute a rules or converter change before it auto-deploys to dev; the reviewer reads it, and once its rounds run out CI alone decides.
  - **ENFORCED — `pr:land` exits `30` and hands the PR to the user:** a `Breaking-Client:` git trailer (it walls installed store clients — a product call; see *Versioning & releases*), and **any PR targeting `beta`/`main`** (a promotion), which `pr:land` cannot land since it only reads PRs based on `develop`.
  - **PARTLY ENFORCED — CI's `breaking-changes` job** ([check-callable-removal.mjs](scripts/check-callable-removal.mjs), [check-schema-change.mjs](scripts/check-schema-change.mjs)): a removed/renamed callable or HTTPS endpoint, and a stored Zod schema that loosens (required field dropped or made optional), fail the PR unless a commit carries `Breaking-Client:` or `Breaking-Client-Exempt:`; a schema that tightens fails unless a registered `pre-deploy` backfill ships in the same PR. Both are heuristics with documented blind spots — see [breaking-change-and-hard-wall.md](docs/decisions/breaking-change-and-hard-wall.md).
  - **NOT ENFORCED — agent discipline:** what those checks cannot see is still breaking — a callable whose input or response **tightens**, a rule tightened against a write old binaries still make, an enum widened under an old converter. Declare it with `Breaking-Client:` or make it non-breaking (expand → migrate → contract). **Production writes and deploys** — `--env=prod`, `pnpm deploy:*:prod`, the *Run Backfill* / *Set App Version* workflows against prod — need the user's explicit go for that specific run.
- **A red lane is not automatically your bug.** Read the log before changing code.

**Parallel batches.** One leader session runs several workers at once with the shared
`orchestrate` skill (an ad-hoc batch: pick with the user, then dispatch), or
`advance-plans` (build every approved plan with no `go`, until nothing agents can move is
left); `review-ideas` checks `ideas/` against the code and asks for yeses. Workers are
admitted by `pnpm agent:capacity` (RAM and emulator suites — never a fixed count),
launched by `pnpm agent:dispatch` into the `cultuvilla-fleet` tmux session, and land with
`scripts/pr-land-bg.sh`. Fleet facts — session names, capacity limits, worktree setup —
live in [.agents/orchestrate.config.json](.agents/orchestrate.config.json). Each worker
inherits this whole contract, the hard-stop list included. In a worktree, run
**`source scripts/agent-env.sh`** once before any emulator test: it installs
dependencies and writes a gitignored `firebase.agent.json` that moves this worktree's
emulators onto their own ports, which
[run-tests-with-emulators.mjs](scripts/run-tests-with-emulators.mjs) then uses. Without
it, two worktrees running emulator suites share 8080/9099 and one silently breaks the
other's tests. The leader frees the slot with `source scripts/agent-env.sh --clean`
before removing the worktree.

**This repo overrides two `superpowers` skills.** `superpowers:brainstorming`'s one-question-per-message rule and `superpowers:finishing-a-development-branch`'s stop-and-ask merge menu are **superseded by `ship-a-feature`**. Every other superpowers skill still applies.

## Things to flag in PRs (or right here when you find them)

- Logic that bypasses a service.
- New `as any` / `@ts-nocheck` / `// eslint-disable`.
- New `<img>` usage when image optimization could matter.
- Reads in components that should be cached or batched.
- Spanish strings that escaped the i18n message catalog.
- Code changes that ship without tests when tests were possible.
- Work that landed outside a worktree when the diff was **not** Direct-path-only (see Development workflow step 1) — and so might have polluted the `develop` base checkout state.
- A hand-rolled `gh pr merge` instead of `pnpm pr:land` — it skips the vacuous-green, staleness and hard-stop checks.

## Be proactive

Surface these as a one-line suggestion (or an inline diff if the change is under ~10 lines) at the end of your response, when you notice:

- **Repeated manual ops (2+ times)** → script in `scripts/`.
- **Encodable workflow** (deploy recipe, migration ritual, audit playbook) → skill under `.agents/skills/<name>/SKILL.md`.
- **Convention used in 3+ places but undocumented** → addition to this file, or a new sub-directory `AGENTS.md` (e.g. `functions/AGENTS.md`, `packages/shared/AGENTS.md`, `apps/mobile/AGENTS.md`) so agents working there don't load the whole root file.
- **Single source of truth violated** (duplicated enum, status string, threshold, hex colour) → consolidate in the same commit if small, propose a follow-up if not.
- **Docs contradicting code** → fix or delete the doc; don't work around it.
- **Shipped plan still in `docs/plans/ongoing/`** → distil durable rationale into `docs/decisions/<slug>.md`, then delete the plan (code is the source of truth). See the `managing-plans-lifecycle` skill. Don't archive — there is no `docs/archive/`.
- **Service touched without tests** → propose adding the missing coverage.

## Shared agent setup

`AGENTS.md` is the shared instruction entry point. Project skills live in
`.agents/skills/`; `.claude/skills` points to that directory. See
[`.agents/README.md`](.agents/README.md) for discovery requirements and dependencies.
