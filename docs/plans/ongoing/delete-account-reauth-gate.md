# Recent sign-in before deleting an account

**Priority:** high
**Landed:** dev
**Gate:** blocked:minSupported must pass the first release carrying #757 before the contract step
**Next:** in `functions/src/account/deleteAccount.ts` drop the `request.data?.reauth === true &&` condition so the recent-sign-in gate applies to every caller, and update the "keeps the old path" handler test to expect a refusal (contract commit; carries `Breaking-Client:`)

State 2026-11-27: #757 merged — expand step: the server gates clients that send `reauth: true`, and the app reauthenticates (Google, Apple, email code) and retries. QA entry `docs/qa/pending/delete-account-reauth.md` needs a person: a sign-in older than 5 minutes on real accounts.

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
