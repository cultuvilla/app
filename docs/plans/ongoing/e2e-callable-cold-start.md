# e2e: a callable's first call waits on a cold Functions-emulator worker

**Priority:** medium — it failed two first attempts in one ios-e2e shard on 2026-11-20 (flows 11 and 12), and each one costs a retry with a full restore

**Landed:** none
**Gate:** none
**Next:** warm the callables a flow uses before its first UI wait, per the plan, and prove it on an ios-e2e run
**Gate:** blocked:PR #722 (open e2e work edits packages/shared/test/ci/iosE2e.test.ts and the Maestro suite seeding this plan changes)

**Goal:** Stop a flow's first callable invocation from outlasting the flow's UI wait, so a first attempt fails only when the app does.

## Context

Measured by w18 on ios-e2e develop run 44826311824 shard 2 (2026-11-20), from that attempt's `maestro.log`, the job log's Functions-emulator lines and `runner-cpu.log`:

- **Flow 12** (`12-group-avisos-chat.yaml`), "Enviado a" not visible: the send tap landed at 23:10:51.7 and the button showed its spinner, so the app took the tap. The emulator started `sendGroupMessage` only at 23:11:44.4, after 53 s in the queue; a new node worker first appeared in `runner-cpu.log` at 23:11:08. The call ran 11.3 s. The flow's 60 s `extendedWaitUntil` had already failed at 23:11:55.1. The next, warm call to the same callable took 2.6 s.
- **Flow 11** (`11-otp-login.yaml`), login-verify-code not found: `verifyAuthOtpCode` started 16 s after the tap and ran 1.6 s. The flow's `repeat while visible → tapOn` loop saw the button, then the screen moved to Explora before the tap landed: a check-then-tap race in the flow, which the slow call exposed. A warm call took 2.5 s.
- Runner load in that shard (mean 158, max 481) was no worse than in passing runs (126–187), so this is the emulator's cold start, not an unusually loaded run.

## Design

Two independent fixes, either useful alone:

1. **Warm each callable a flow uses** once, after seeding and before the first flow: one throwaway invocation per callable from the suite runner, which loads its emulator worker. The production cold start is seconds, not the 53 s seen here, so warming removes an emulator-only cost and hides nothing a user sees. The app's spinner and its timeout behaviour stay under test through the real call.
2. **Fix flow 11's check-then-tap loop** so a tap on a button that is already gone counts as done when the next screen is showing (wait on the destination, not on the button).

**Alternatives considered:** raising the 60 s waits (hides a real slow call); warming per flow (pays the cost on each flow).

**Testing strategy:** the suite's own `iosE2e.test.ts` lock for the warm step; then 3 ios-e2e develop runs with no first-attempt callable timeout.

## Paths

`scripts/lib/maestro-suite.mjs` (or the suite step that seeds), `apps/mobile/e2e/native/flows/11-otp-login.yaml`, `packages/shared/test/ci/iosE2e.test.ts`. Android shares the flows, so check `android-e2e` too.

## Approval

Pre-approved — "test and CI health — flakes, missing coverage, a broken lane". It only touches the test path.

## Out of scope

Callable performance in production, and the runner itself.
