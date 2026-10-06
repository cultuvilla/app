# Store release pipeline — promotion-driven, announce when live

**Priority:** high

**Goal:** a store release is a side effect of the promotion PR, like the
backend already is. Users are told to update only once the store actually
carries the version. Modeled on ordago-apps, adapted where Cultuvilla differs.

## Context

The current pipeline was built for one purpose: keep Play's "12 testers × 14
days" clock running. That is over — the closed test finished and Play production
was submitted on 2026-09-08 ([store-release.md](../ongoing/store-release.md)).
What is left was never designed as a release process, and it shows:

- **Users are nudged to versions the store does not have — live on prod today.**
  The deploy writes `config/appVersion.<platform>.latest` from `app.config.ts` on
  every promotion ([deploy-firebase.yml](../../../.github/workflows/deploy-firebase.yml),
  *"Announce the shipped version to clients"*). On 2026-09-11 prod said
  `ios.latest: 1.1.0` while the App Store served `1.0.0`, so `resolveVersionGate`
  returns `nudge` for every iOS install.
- **The nudge's "Update" button opens a dead page.** `config/appVersion.storeUrl.ios`
  is `https://apps.apple.com/app/id000000000`, from
  [app-version-config.mjs](../../../scripts/lib/app-version-config.mjs) — a
  second copy of the store URLs that nobody updated when iOS went live. The single
  source is [appStores.ts](../../../packages/shared/src/config/appStores.ts), which
  [app-stores.mjs](../../../scripts/lib/app-stores.mjs) can already read from Node.
- **`beta-build-and-submit` ships whatever ref it is dispatched from.** Its
  `workflow_dispatch` has no branch restriction, and that is how `5 (0.24.0)`
  reached testers from `develop` on 24 Aug without a promotion.
- **`mobile-release` is red.** Its last four dispatches (26–28 Aug, three Android
  production, one iOS TestFlight) all failed. The failed-step logs show only
  cleanup, so the cause has not been read yet.
- **Production is a manual dispatch per store**, and Play release notes are typed
  by hand.

## How ordago-apps does it

Read on 2026-09-11 from `~/githubs/ordago-apps/.github/workflows/`:

| | ordago-apps |
|---|---|
| Trigger | `pull_request: closed` on the merged promotion PR (`develop→beta`, `beta→main`); checks out **`ref: beta` / `ref: main` explicitly**, so even a manual dispatch builds the promoted branch |
| When to build | only when `app.json` changed; everything else reaches users as an OTA update |
| Production | automatic on the `beta→main` merge: Android `--auto-submit` to production, iOS submitted for review via ASC `reviewSubmissions` (a non-fatal step, with `submit-ios-review.yml` to recover) |
| Release notes | `extract-store-notes.js` from the CHANGELOG, `push-play-release-notes.js` to Play |
| Announcing | `record-pending-announce` at build time; `announce-version-poll.yml` checks store liveness every 30 min **while armed**, then deploys functions and flips `app_updates` |

Its own warning: the poller was armed for about 11 days in 2026-08 and cost 3,370
billed minutes, half that repo's Actions bill, until the checks moved to a
self-hosted runner. See its `docs/decisions/announce-when-live-poller.md` and
`announce-hold-flip-and-auto-release.md`.

## Design

### 1. Fix the dead Update link now (does not wait for the rest)
Derive `STORE_URL` in `app-version-config.mjs` from `appStores.ts` via
`app-stores.mjs`, and delete the second copy. An empty entry (Android until Play
approves) should fall back to the Play package URL, as today. Re-seed prod
`storeUrl` through **Set App Version**.

### 2. Announce only what the store carries
**Done (2026-10-06)** — a poller after all: `announce-when-live.yml` moves each
platform's `latest` once its store serves the release, and raises the wall for a
breaking one. This repo is public, so its Actions minutes are free; each idle
tick also stops after a single Firestore read. See
[announce-when-live-poller.md](../../decisions/announce-when-live-poller.md).

### 3. Promotion PR triggers, explicit checkout
Adopt ordago's trigger: `pull_request: closed` + merged + head is the expected
source branch, and `actions/checkout` with `ref: beta` / `ref: main`. That makes
the dispatch guard structural rather than a condition someone has to remember.

### 4. Build when native code changed, not when the version changed
**This is where Cultuvilla cannot copy ordago.** Here the MINOR is bumped on every
`develop → beta` promotion (AGENTS.md, *Versioning & releases*), so "the version
changed" is true every time and would build a binary on every promotion. The
right signal is the one OTA already uses: `runtimeVersion` is `fingerprint`. If
the fingerprint of the promoted commit matches the latest store build, publish
OTA only; if it differs, build and submit a binary.

### 5. Production automatic on `beta → main`
**Decided (2026-09-11): yes, gated by §4.** The promotion PR becomes the release
decision. A fingerprint change builds and submits (Android to the production
track; iOS to review, releasing `AFTER_APPROVAL` with the 7-day phased release
already in place). A fingerprint match publishes the `production` OTA channel,
which today is also a manual dispatch. This reverses AGENTS.md's "production is
never automatic", so that text changes in the same PR.

### 6. Release notes from the CHANGELOG, both stores
`scripts/lib/changelog-notes.mjs` already derives App Store *What's New* from the
stamped CHANGELOG block. Reuse it for Play (ordago's `push-play-release-notes.js`
is the model).

### 7. Retire the closed-track rationale
`beta-build-and-submit` exists for the 14-day clock, which no longer applies.
Decide what a `beta` binary is for now — probably a TestFlight / closed-track
build only when the fingerprint changed, so native changes are exercised before
`main` — and rewrite its header and AGENTS.md's *Closed-track releases* bullet.

## Order

1 (dead link) → diagnose `mobile-release` → 2 (announce) → 3–7 together. §1 and
§2 fix live user-facing problems; the rest is process.

**The current shape is locked by tests**, which must change on purpose in the same
PR rather than be worked around:
[storeRelease.test.ts](../../../packages/shared/test/ci/storeRelease.test.ts)
asserts that `mobile-release` has *no* `push`/`pull_request` trigger and that
`beta-build-and-submit` runs on `branches: [beta]` with `inputs.track || 'closed'`;
[otaUpdates.test.ts](../../../packages/shared/test/ci/otaUpdates.test.ts) covers
the OTA channels.

## Open questions

- Staged rollout percentage for Play production (ordago: none; Play supports it).
- ~~Should a `block` (raised `minSupported`) also wait for store liveness?~~ Yes, and it does (announce-when-live) —
  blocking users on a version they cannot install is worse than the nudge.
