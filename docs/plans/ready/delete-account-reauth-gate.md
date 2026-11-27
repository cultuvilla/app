# Recent sign-in before deleting an account

**Priority:** high

**Decided 2026-11-27 (Álvaro):** yes — from the Órdago harvest. A user may be asked to
sign in again before deleting their account.

**Goal:** `functions/src/account/deleteAccount.ts` deletes on any valid token. Require a
sign-in no older than 5 minutes (`auth_time`), since deletion cannot be undone and a
stolen session should not be enough.

Source: `~/githubs/ordago-app/ordago-apps` `docs/decisions/reauth-gate-on-destructive-callables.md` (added after a
takeover incident).

## Done when

- The callable refuses an old `auth_time` with a specific error code; tests under the
  emulator harness.
- The app catches that code, runs the sign-in the account uses (OTP email, Apple,
  Google) and retries; copy through i18n; QA entry.
- Expand → migrate → contract: installed binaries that cannot reauth must not be
  stranded. Either the gate waits until `minSupported` passes the version that
  handles it, or older clients keep today's path; the plan picks one and says why.
