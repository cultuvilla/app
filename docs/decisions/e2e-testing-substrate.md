# E2E testing substrate (web Playwright + native Maestro)

> **2026-10-02:** the web half is gone. The Expo web build was retired when the
> web became a server-rendered read site
> ([web-is-a-read-site.md](web-is-a-read-site.md)), and its Playwright suite
> with it. Maestro on Android is the E2E suite; the read site is covered by
> emulator tests in `functions/src/__tests__/handlers/web/`. What follows is the
> original rationale, still true for the native half.

## Context

Unit and emulator *rules* tests existed, but nothing exercised a real navigation
flow against real Firebase behaviour. Cultuvilla ships a web build (`expo export
--platform web` → Firebase Hosting) that runs the same React tree as native via
react-native-web, so the same flows can be driven on web now and on device later.
A running-app E2E needs three things unit tests don't: a client emulator-connect,
emulator-mode seeding, and a test-login that works in a production-like export
build (where `__DEV__` is false).

## Decision

- **One portable substrate, two drivers.** The reusable layer is the seeded
  dataset + `apps/mobile/e2e/lib/fixtures.ts` + `emulatorState.ts` (Firestore
  emulator reads over REST, pure Node). Flows assert on **Firestore emulator
  state, not DOM** — that is the stable backbone; UI-driving (`testID`) is the
  fragile half. Only the *driver* changes between web (Playwright) and native
  (Maestro); `fixtureLogin.ts` (`window.__cultuvillaE2E`) is the one web-specific
  piece.
- **`emulatorState` reads bypass rules with `Authorization: Bearer owner`.** These
  reads assert backend truth, not security rules; the emulator enforces rules on
  its REST API, so an unauthenticated read of a rule-protected collection
  (`organizerRequests`, members, …) returns empty and silently fails the
  assertion. The owner token is the emulator's rules-bypass.
- **Fixture-login security model (the crux).** A test-login is a deliberate auth
  bypass; the invariant is that it can never activate in a build a real user could
  load. Three independent guards, so no single mistake leaks:
  1. **One flag gates everything** — `USE_FIREBASE_EMULATOR` (→ `app.config.ts`
     `extra.useEmulator`) gates *both* the emulator-connect seam *and* the
     fixture-login. Set **only** in the E2E CI job; never in `deploy-*.yml` or
     `.env`.
  2. **Fail-closed by physics** — fixture-login and emulator-connect share the
     flag, so a fixture session can only mint when pointed at `127.0.0.1`
     emulators. A deployed build (real hosts, no emulator) can't complete the flow
     even if the flag leaked. Hardened further with a runtime loopback-host
     assertion before the seam fires, and a positive "flag is unset" assertion in
     the deploy workflows.
  3. **Grep gate** — `scripts/check-no-test-login-leak.mjs` fails CI if the flag,
     the fixture-login symbols, or any `connect*Emulator` appear outside a short
     allowlist (the seam files). Wired into `pnpm check`.
- **Fixtures built through the production `build*Data` model builders** so they
  can't drift from schema. Seeded by a standalone `scripts/seed/e2e.mjs` against a
  dedicated emulator project `cultuvilla-test` (never the real `villa-events`);
  `scripts/seed/lib/context.mjs` relaxes its `villa-events`-only + credentials
  guards when `FIRESTORE_EMULATOR_HOST` is set.
- **Native Maestro is a full suite, in CI, gated to the release paths.**
  `apps/mobile/e2e/native/` drives a standalone APK on an AVD through eight
  flows; `.github/workflows/android-e2e.yml` runs them on PRs targeting
  `beta`/`main` and pushes to those branches — the same gate as `web-e2e`, for
  the same reason (an emulator boot plus a Gradle build is far too slow for
  day-to-day `develop` PRs). On an AVD the emulator-connect host is `10.0.2.2`.

  It exists **next to** the web suite, not instead of it: the web driver runs
  the same React tree through react-native-web, so it proves the product logic
  but never the platform. Native boot, the deep-link intent path, AsyncStorage
  auth persistence, the native Firebase SDK, RN modals/pickers/soft-keyboard and
  `Alert.alert` — which react-native-web ships as a **no-op**, so no web test has
  ever executed a confirmation dialog — are invisible to Playwright and shipped
  to users.

- **The native login seam is a deep link, and the bypass wall moved.** Maestro
  drives the UI and cannot reach `window.__cultuvillaE2E`, so credentials arrive
  as `cultuvilla://?e2eLogin=<email>%7C<password>` — handled by the SAME armed
  predicate and the SAME `signInWithEmailAndPassword` primitive. One parameter,
  pipe-separated, because `adb shell am start -d` eats an unescaped `&`.

  `Platform.OS === 'web'` used to make it *structurally impossible* for the
  bypass to exist in a store binary. That accident is gone, so the wall is now
  deliberate: **app.config.ts refuses to evaluate for `APP_ENV=beta|prod` with
  `USE_FIREBASE_EMULATOR=1`**, which holds on every build path — CI, EAS and a
  laptop alike — because they all evaluate it. The host allowlist widened by
  exactly one non-routable AVD alias, and the grep gate gained a fifth rule.

- **Flow ORDER is owned by the runner, not by Maestro.** Maestro's workspace mode
  does not guarantee discovery order, and the suite depends on it (22 unregisters
  what 20 registered). `scripts/run-android-e2e.mjs` enumerates and sorts the
  flows itself, one `maestro test` per flow, so a CI failure names the flow.

## Rejected alternatives

- **Gate the E2E login on `__DEV__`** — `__DEV__` is false in the `expo export`
  bundle Playwright drives, so it wouldn't fire. Keyed off `USE_FIREBASE_EMULATOR`
  instead (independent of `__DEV__`; the local dev login buttons keep their own gating).
- **`signInWithCustomToken` / a broader auth surface** — rejected to keep the
  bypass to a single `signInWithEmailAndPassword` primitive, so the grep gate has
  one small surface to guard.
- **Thread a new `DATASET` through the six domain seeders** — rejected for a
  self-contained `seed:e2e`, isolated from the dev-seed path while keeping the
  built-from-prod-builders property.
- **Detox for native** — rejected in favour of Maestro (YAML flows).

## What this binds

- A new flow — web OR native — drives the UI by `testID` and makes its **strong
  assertion against Firestore emulator state** (`emulatorState.ts` on web,
  `native/scripts/{docField,queryCollection}.js` on native, both using the
  `Bearer owner` rules-bypass). Reuse the existing fixture-login seam; don't
  broaden the auth surface or the bypass-leak allowlist.
- A native flow gets the next numeric filename prefix — the order is load-bearing
  and `packages/shared/test/ci/androidE2e.test.ts` enforces the convention.
- `USE_FIREBASE_EMULATOR=1` may only ever produce a `dev` bundle.
- All fixtures go through the `build*Data` builders.
- `USE_FIREBASE_EMULATOR` must never appear in deploy workflows or `.env`; the grep
  gate enforces it.
- The `web-e2e` CI job is gated to the **beta/main release paths** (PRs targeting
  `beta` or `main`, and pushes to those branches), not day-to-day `develop` PRs
  — expensive emulator+Playwright boot, run at the release-candidate and
  production-promotion gates. `develop` PRs get the fast `typecheck-and-test`
  job.

## Revisit when

The testing-enhancement effort that produced this substrate is complete on both
drivers. Deliberately deferred, none currently planned:

- **iOS.** Maestro drives simulators too, but GitHub's macOS runners are ~10x the
  cost of Linux and the native risk this suite covers is overwhelmingly shared
  RN, not platform-specific. Revisit if an iOS-only regression ever ships.
- CI minutes hurt → add `dorny/paths-filter` so UI-only PRs skip the emulator job.
- Coverage should gate, not just report → wire `diff-cover` and gate on **patch/diff
  coverage only, never absolute total** (a total gate on the existing baseline would
  be a demoralizing wall; patch coverage ratchets quality up on new code only).
