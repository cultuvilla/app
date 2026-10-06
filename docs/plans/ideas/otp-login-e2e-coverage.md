# OTP login E2E coverage

**Priority:** low
**Gate:** blocked:no native (Maestro) E2E driver to write the spec against yet
**Next:** write the login spec once the native (Maestro) driver is the target — see *Why the spec is deferred*

**Goal:** Cover the login screen (`apps/mobile/app/(auth)/login.tsx`) end to end. It is
the only screen no test ever opens — every existing spec starts already signed in.

## Done

The backend half: `sendAuthOtpCode` now completes under the Functions emulator (writes
the plaintext code to the doc instead of emailing it), so the flow is exercisable
locally by any driver, and by hand against a dev client.

## Context

Every spec in `apps/mobile/e2e/flows/` bypasses the login screen via
`apps/mobile/e2e/lib/fixtureLogin.ts`, which calls a test-only seam
(`window.__cultuvillaE2E.login`) that signs in directly with
`signInWithEmailAndPassword` against the emulator — no UI typing, no Google popup, no
email code. That was deliberate (see [e2e-testing-substrate](../../decisions/e2e-testing-substrate.md)):
driving a login screen for fifteen unrelated flows is pure tax. The side effect is that
`login.tsx` could be broken for both providers with the suite fully green.

The flow under test is the 6-digit code sign-in described in
[otp-email-signin](../../decisions/otp-email-signin.md).

## The blocker that used to make this impossible

Two walls stood in the way, and only the first was obvious:

1. `authOtpCodes` stores `sha256(code)` and never the plaintext — by design, since a
   readable code collection is an account-takeover primitive. A test cannot read the
   code out of Firestore.
2. **`sendAuthOtpCode` did a real Resend HTTP send with a secret that does not exist
   locally**, so under the emulator it threw `internal` and the flow died at step one.
   The OTP login was not completable by *any* local means — not Playwright, not Maestro,
   not by hand on a dev client.

Wall 2 is now removed: under `FUNCTIONS_EMULATOR === 'true'` the callable skips Resend
and writes `emulatorCode` (plaintext) onto the doc. The guard is physics — that variable
is set by the emulator runtime and cannot be true in deployed Functions — and nothing
enters the client bundle, so the auth-surface allowlist guarded by
`scripts/check-no-test-login-leak.mjs` is untouched. That also removes wall 1: a driver
reads the code through the existing `emulatorState` REST helper, the substrate's normal
"assert on backend truth" pattern.

The two options this plan used to weigh — a client-side seam exposing the code, or
intercepting the Resend call — are both moot. The seam option would have broadened the
bypass surface that the substrate decision explicitly binds against widening.

## Why the spec is deferred

The product is heading for a native release, not a web one. The E2E substrate splits
into a portable half (seeded fixtures + `emulatorState` assertions) and a web-specific
driver half (`fixtureLogin`, Playwright DOM typing). **A login spec is almost entirely
the driver half** — its whole substance is typing into inputs — so writing it against
Playwright now means writing the part that gets thrown away when Maestro takes over.
Better to write it once, against the driver that will still be there.

Worth being honest about what it will and will not buy. It covers the screen's wiring
and the wrong / expired / exhausted / happy-path branches. It would **not** have caught
either real production failure: the magic-link session landing in a different browser's
storage, or `createCustomToken` being refused by IAM (the Auth emulator stubs signing —
see the incident section of [otp-email-signin](../../decisions/otp-email-signin.md)).
Both were environment failures, and only the IAM one has a guard today
(`scripts/check-custom-token-signing.mjs`, pre-deploy).

## Open questions

- Whether the more valuable follow-up is this spec at all, or a **post-deploy synthetic
  against a real environment** — real Resend, real IAM signing, real session persistence
  across a relaunch. That is the tier that matches how this flow has actually broken. It
  should be scoped once the release surface (native vs web) is settled, and probably
  deserves its own plan.
- Whether to also cover the Google sign-in popup, or keep this to the OTP flow.
- The E2E config is `workers: 1, fullyParallel: false`, so every spec added is serial
  wall-clock on every mobile CI run. Keep this to one flow, not a matrix.
