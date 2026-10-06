# Production releases itself on the beta → main merge

**Decided 2026-10-06 (user)**, to iterate faster. Supersedes the rule that
production — store binaries and the `production` OTA channel — moved only by an
explicit dispatch after the merge.

## The decision

Merging the `beta → main` promotion PR is the one human gate. Everything after
it is mechanical, in [production-release.yml](../../.github/workflows/production-release.yml):

| What | When | How |
|---|---|---|
| OTA → channel `production` | every push to `main` that touches more than `docs/`, `*.md`, `.github/` | calls [mobile-ota.yml](../../.github/workflows/mobile-ota.yml) with `channel: production` |
| Android `com.cultuvilla.app` → Play `production` | `apps/mobile/package.json` version differs from the previous `main` tip | `eas build --profile production --auto-submit-with-profile production` |
| iOS → App Store review | same version condition | `appstore-release.mjs submit`, no build number: the newest TestFlight build of that version, which `beta-build-and-submit` built and testers ran |

All three wait until the prod backend deploy (*Deploy prod*'s `deploy / …` job)
is green. A bundle that calls a callable prod has not deployed yet — or that the
conformance or backfill gate blocked — is a broken app, not an early one.

**A breaking release is the exception.** A breaking release has a
`Breaking-Client:` trailer since the previous release tag. Its deploy holds the
functions and rules until both stores serve the release, and holding them still
counts as green. So the store jobs ship as usual. The production OTA is skipped,
because it would run the new bundle against the old backend. The announce
poller then raises the wall and ships the held backend. See
[announce-when-live-poller.md](announce-when-live-poller.md).

`mobile-release.yml` and *App Store release* stay as the manual escape hatches:
testing tracks, rebuilds, resubmits, releasing or pausing a phased rollout.

## Kill-switches

| Stop | Scope |
|---|---|
| `[skip-store]` in the merge commit | no binaries for this push |
| `[skip-ota]` in the merge commit | no OTA for this push |
| repo var `STORE_RELEASE_PAUSED=true` | no binaries, either store, while set |
| repo var `PLAY_SUBMIT_PAUSED=true` | no Android, beta app included (the existing Play freeze). iOS still ships, so the run warns that the stores split |
| repo var `PROD_OTA_PAUSED=true` | no production OTA while set |
| `[skip-deploy]` in the merge commit | nothing ships: the backend for that commit was not deployed |

**The store switches are one-shot per version.** Unsetting
`STORE_RELEASE_PAUSED` or `PLAY_SUBMIT_PAUSED` does not resume a release it
suppressed. Binaries ship only on the push that changes the version, so a later
push to `main` never retries them. To ship a suppressed release, re-run that
workflow run once the switch is off, or ship it by hand: *App Store release* →
`submit`, or `mobile-release` (track `production`).

**The OTA switches recover on their own.** OTA does not depend on the version.
After `PROD_OTA_PAUSED` is unset, or after a `[skip-ota]` merge, the next push to
`main` that changes the bundle publishes everything since. To publish sooner,
dispatch `mobile-ota` to `production`.

Never disable the workflow to pause one platform: disabling
`beta-build-and-submit` during the 2026-09 Play review silently froze iOS too.

**Prerequisite for the OTA:** the EAS channel `production` must point at the
branch `production`, because `mobile-ota.yml` publishes with
`--branch production`. Confirm this once with `eas channel:view production`.

**iOS and Android come from different commits of the same version.** iOS ships
the TestFlight binary built from `beta`. Android builds from the `main` merge
commit. The two trees match unless a conflict was resolved during the
promotion, and `main` accepts only merges from `beta`, which keeps that rare.

## Why only on a version change

A re-deploy of `main`, or a hotfix merge without a bump, must not mint a new
binary: each build costs an EAS build slot and, on Play, a new production
release of the same marketing version. The version is the release marker —
`pnpm release:cut` writes it and `version-gate.yml` enforces the bump — so
comparing it with the previous `main` tip is exact.

## The prerequisite: the fingerprint has to survive a release

The `fingerprint` runtimeVersion decides which installed binaries an update
reaches. Measured 2026-09-15, two things meant an update published from a
release commit reached **no** binary at all:

1. **@expo/fingerprint hashes the marketing `version` by default.** 1.2.1 and
   1.2.2 of the same native code hashed differently, so each release minted a
   runtime only its own binary had. [fingerprint.config.js](../../apps/mobile/fingerprint.config.js)
   now skips `ExpoConfigVersions`. That is safe: `version` carries no native
   code, and `buildNumber` / `versionCode` come from EAS's remote counters
   (`appVersionSource: remote`), never from app.config. Verified locally with
   `APP_ENV=prod npx expo-updates runtimeversion:resolve`: identical hashes at
   1.6.0 and 1.7.0 with the config (iOS `41370623…`, Android `cc91db1f…`),
   different without it.
2. **CI patched `eas.json` before `eas build`.** `eas.json` is a fingerprint
   source, and the iOS jobs wrote the ASC key ids into it before uploading the
   project, so a build's fingerprint never matched a clean checkout of its
   commit. The patch now runs after the build, right before `eas submit` —
   the only step that reads it.

Both are locked by [otaUpdates.test.ts](../../packages/shared/test/ci/otaUpdates.test.ts).

**Binaries built before this landed keep the old fingerprint and receive no
production OTA.** The first release built after it is the first one updates can
reach. Before relying on OTA for an older binary, check it with
`eas fingerprint:compare --build-id <id> --environment production`.

## Rollout shape

iOS submits with a 7-day phased release (`appstore-release.mjs` default), which
App Store Connect advances by itself. Android submits with the production
profile's `releaseStatus: completed` — 100% at once. A Play staged rollout
(`inProgress` + `rollout`) was considered and left out: Play never advances one
by itself, so every release would stop at the first percentage until a human
raised it, which is the manual step this decision removes. Halting a bad Play
release stays a Play Console action; a JS-only fix reaches it by OTA.

Because Android goes out at 100%, it never goes first. When binaries would ship,
the `plan` job refuses a commit whose `apps/mobile/package.json` and
`app.config.ts` versions disagree, or whose CHANGELOG has no `## vX.Y.Z` section
(the iOS "What's New"). Then the `android` job waits for the `ios` submit, which
is what proves a processed TestFlight build of the version exists. A failure in
either place stops both stores, and the release stays whole. This matters
because a fix commit does not bump the version, so a release that stopped halfway
would never re-run by itself. In that case, finish it by hand with *App Store release* →
`submit` and `mobile-release` (track `production`).

## What it costs

One EAS production Android build per release (approved by the user with this
decision). iOS costs nothing new: the binary already exists from the beta merge.
