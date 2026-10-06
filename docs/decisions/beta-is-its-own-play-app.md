# The Android beta is its own Play app

**Decided 2026-09-28**, the day the Play listing went public. Supersedes
*store-tracks-share-prod* (2026-08-24), which shipped the prod package to every
Play track so the closed test counted toward Play's 12-testers-×-14-days rule.
That rule is satisfied now, and the arrangement it forced had become the problem.

## The decision

| Surface | Package | Firebase project | Distribution |
|---|---|---|---|
| Play **Cultuvilla** (`internal` / `closed` / `production`) | `com.cultuvilla.app` | `cultuvilla-prod` | `production` on a version-bumping merge to `main` ([production-auto-release](production-auto-release.md)); other tracks by `mobile-release` dispatch |
| Play **Cultuvilla Beta** (`internal`) | `com.cultuvilla.app.beta` | `cultuvilla-beta` | every merge to `beta` (`beta-build-and-submit`) + OTA channel `beta` |
| iOS App Store / TestFlight | `com.cultuvilla.app` | `cultuvilla-prod` | TestFlight on every merge to `beta`; App Store review on the merge to `main` |
| `preview-dev` APK / dev client | `com.cultuvilla.app.dev` | `villa-events` | sideload only — **never submitted** |

So on Android a tester has **Cultuvilla**, **Cultuvilla Beta** and (for us) **Dev**
installed side by side, each against its own data — Órdago's arrangement.

## Why the prod package stopped going to the closed track

Play serves a tester the **highest version code across every track they have
joined**. `beta` merges uploaded a new `com.cultuvilla.app` build to the closed
track on every promotion, so testers were always ahead of production: the
public listing showed them "(Internal testing)" / "Beta", and they were never
running what the public ran. Now that the listing is public, a founder or a
friendly pueblo admin should be able to use the real app like anyone else.

## Why a separate package, and what it costs

A separate package is a separate **install**, and four things bind to package
identity rather than to the user. The old record treated those as reasons not
to split; with beta on its **own backend** they are simply per-app setup, done
once:

- **FCM token** — `google-services/beta/google-services.json` (Android app
  registered in `cultuvilla-beta`). Tokens live in beta's Firestore, so a beta
  install never double-delivers a prod push.
- **Google Sign-In Android OAuth client** — keyed on package + signing SHA-1.
  Created by adding the beta app's Play **app signing** SHA-1 to the Firebase
  Android app.
- **App Links** — beta claims `cultuvilla-beta.web.app`, never `cultuvilla.es`,
  so it cannot steal a prod link (the failure Órdago hit when beta claimed the
  prod domain). Its `assetlinks.json` needs the beta app signing SHA-256.
- **Icon** — labelled just "Beta" (`namePerEnv`), like "Dev"; launchers
  truncate "Cultuvilla Beta". The Play listing keeps the full name.

The Play-side cost is one extra listing on the **internal** track: no review, no
12-tester clock, up to 100 testers.

## iOS stays on the prod bundle

TestFlight and the App Store share one install per bundle id, so iOS cannot put
beta next to prod without a second App Store Connect app record. Not worth it
yet: TestFlight keeps building the `production` profile, and an iOS tester
chooses which of the two they run.

## Known limitation: beta data is thin

`cultuvilla-beta` has little real content, so the beta app is for smoke-testing
a release, not for living in. The deploy's conformance/backfill gates still run
there first. If testers need real pueblos, extend `mirror:village` to target
beta — a separate decision, since it copies personal data out of prod.

## Guardrails

- `mobile-ota.yml` passes `--environment` (production → `production`, else
  `preview`). An update replaces the binary's `extra.firebaseConfig`, and every
  update up to 1.4.1 shipped an empty one; harmless only while no store build
  listened on `beta`.
- Freeze beta uploads with `PLAY_SUBMIT_PAUSED=true`, never by disabling the
  workflow (that stops TestFlight too).
- Locked by [storeRelease.test.ts](../../packages/shared/test/ci/storeRelease.test.ts),
  [otaUpdates.test.ts](../../packages/shared/test/ci/otaUpdates.test.ts) and
  [googleServices.test.ts](../../packages/shared/test/ci/googleServices.test.ts).
