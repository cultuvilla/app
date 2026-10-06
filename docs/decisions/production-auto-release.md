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

`mobile-release.yml` and *App Store release* stay as the manual escape hatches:
testing tracks, rebuilds, resubmits, releasing or pausing a phased rollout.

## Kill-switches

| Stop | Scope |
|---|---|
| `[skip-store]` in the merge commit | no binaries for this push |
| `[skip-ota]` in the merge commit | no OTA for this push |
| repo var `STORE_RELEASE_PAUSED=true` | no binaries, either store, until unset |
| repo var `PLAY_SUBMIT_PAUSED=true` | no Android, beta app included (the existing Play freeze) |
| repo var `PROD_OTA_PAUSED=true` | no production OTA until unset |

Never disable the workflow to pause one platform: disabling
`beta-build-and-submit` during the 2026-09 Play review silently froze iOS too.

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

## What it costs

One EAS production Android build per release (approved by the user with this
decision). iOS costs nothing new: the binary already exists from the beta merge.
