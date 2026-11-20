# e2e: switch user without reinstalling the app

**Priority:** medium — about half of iOS flow 13's 16 min is reinstall and settle cost, which keeps `FLOW_TIMEOUT_OVERRIDES_MS` alive and makes every multi-user flow slow on both platforms

**Goal:** Let a Maestro flow change the signed-in user without `clearState`'s uninstall/reinstall, so a login costs seconds instead of about a minute and the per-flow timeout overrides can go.

## Context

Measured by w18 on 2026-11-20 (ios-e2e run fix-2, flow 13's first login, `maestro.log` + `commands.json`), one 78 s login:

- `clearState`: 22 s, all simctl (terminate 2.6, copy binary 4.0, uninstall 3.3, install 4.9, applesimutils 1.4, privacy reset 3.2);
- 3× `openLink` with Maestro's animation settle: 25 s, the first including app launch;
- hierarchy and screenshot settles: about 16 s (`waitForAnimationToEnd` 7.0 s against its 4 s timeout);
- cold start to the Explora tab bar: 13.6 s;
- sign-in plus first reads: 23–30 s, overlapping the steps above;
- App Check: negligible (a 17 ms 403), and skipped in emulator builds since the keepalive PR.

So about 63 of 78 s is simctl and Maestro on the shared runner. Flow 13 logs in about 6 times, which puts roughly 8 of its 16 min there. The connection stalls that used to dominate are fixed: emulator keepalive enforcement, see `docs/decisions/ios-e2e-emulator-keepalive.md`.

## Design

Sign out and back in through the existing `e2eLogin` deep-link seam, without `clearState`, wherever a flow only needs a different user. Keep `clearState` where a flow needs a truly fresh install (onboarding, permission prompts). Isolation is the risk: prove that no per-user state (Firestore cache, AsyncStorage, notification settings) leaks between users, for example with a flow that signs in as A, then B, and asserts none of A's data shows.

**Alternatives considered:** a faster runner (declined 2026-11-20, running cost); trimming Maestro settles alone (saves about 16 s, not the 22 s reinstall).

**Testing strategy:** the cross-user leak flow above, plus 3 clean ios-e2e and android-e2e runs before dropping `FLOW_TIMEOUT_OVERRIDES_MS`.

## Paths

`apps/mobile/e2e/native/**` (the shared `login.yaml` and its callers), the `e2eLogin` seam in the app, `scripts/lib/maestro-suite.mjs`, `packages/shared/test/ci/iosE2e.test.ts`.

## Approval

Pre-approved — "test and CI health — flakes, missing coverage, a broken lane". It only touches the test path, and the `e2eLogin` seam exists only in emulator builds, so no user sees a change.

## Out of scope

Changing the runner, and any change to how real users sign in.
