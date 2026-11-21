# iOS e2e: three unexplained first-attempt failures

**Priority:** medium — each passed on retry, but two of them may be app behaviour (a cleared input, a list that never loads), not the test path

**Goal:** Find the cause of each failure below, and fix it where it lives: the flow, the test harness, or the app.

## Context

Classified by w18 from ios-e2e develop run 44889372664 (2026-11-21, on e97c7923), each from that attempt's `maestro.log`, screenshots and job log. None of them is a cold callable (`e2e-callable-cold-start`), the lost tap, or the contact gate.

- **Flow 11 (shard 2), the typed email disappears.** The flow saw `${EMAIL}` in the field at 10:16:59. All three login-submit taps (10:17:04, :19, :33) then got "Revisa el correo" over an empty field (screenshot step-027), and `sendAuthOtpCode` never ran. The field emptied between input and submit: either Maestro's text input didn't stick, or the login screen remounted. A remount would be an app bug.
- **Flow 20 (shard 1), the tap landed on the wrong row.** The persons sheet shows "Abuela Publica" ticked and "Lucía Dependiente" unticked (step-050), after the flow tapped the dependent's row. This fits a list reflowing under the tap.
- **Flow 70 (shard 3), the join request never appeared.** `onOrgJoinRequestCreated` ran at 10:45:24, so the request existed. The admin opened the org page at 10:46:35 and scrolled for 20 s without finding an `approve-join-…` row. Screenshot step-180 shows no requests section at all. It may share a cause with the contact gate (a listener holding a stale snapshot; see `ios-e2e-emulator-keepalive.md`'s open question).

## Design

One investigation per flow, from the artifacts of a failing attempt. A fix goes where the cause is:
- in a flow, as a wait on a real state;
- in the app, as a defect fix — and if the fix changes what a user sees, it needs a yes.

Never add a retry or a longer timeout that would hide a real app failure.

**Alternatives considered:** leaving them to retries (each retry costs a full restore, and two may be real bugs).

**Testing strategy:** a unit or jest repro for any app cause; then 3 ios-e2e runs with none of the three on a first attempt.

## Paths

`apps/mobile/e2e/native/flows/{11-otp-login,20-registration-signup,70-org-create-approve-join}.yaml`, the login screen and org page under `apps/mobile/app/`, and their services as found.

## Approval

Pre-approved — "test and CI health — flakes" and "fixing a defect whose correct behaviour is not in dispute". A fix that changes what a user sees is the exception, and goes up for a yes.

## Out of scope

The contact gate itself (w18's diag 13), cold callables, and restore failures.
