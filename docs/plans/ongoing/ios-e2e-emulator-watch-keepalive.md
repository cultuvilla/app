# iOS e2e: Firestore emulator watch streams time out on the macOS runner

**Priority:** medium — makes flow 13 (and likely any long, write-heavy iOS flow) flaky; iOS e2e is not a required check, so it erodes trust in the lane rather than blocking merges
**Landed:** dev
**Gate:** none
**Next:** classify ios-e2e gate run 2 (44927921605 on b2c4ab83: shards 1 and 2 red, shard 4 cancelled); check the cancelled-listener probe line and that the 499 count is 0 (#746). Then get 3 fully green develop runs, drop flow 13's re-sign-in fallback (#662), and settle the contact-gate question (diag 13). Worker w18-ios-keepalive may still be on it: read ~/.claude/orchestrator/cultuvilla-cultu-upgrade/reports/w18-ios-keepalive.log first

> Decided 2026-11-20 (Álvaro): keep the tests close to reality — so no test-build-only re-listen workaround (it would hide the very stream failure users could hit). Lighten the suite first; a paid larger runner only if that fails, as a new question.

> Decided 2026-11-20 (Álvaro), after #715 did not clear the timeouts: no paid runner for now — research until the cause is fully identified, starting with the keepalive vs ping-enforcement mismatch, and leave a solid long-term system in the lane.

**Goal:** Stop the iOS Firestore SDK's watch and write streams from dying with `Unavailable: ping timeout` against the emulator in `ios-e2e`, so flow 13 passes reliably and the re-sign-in fallback added in #662 is no longer needed.

## Context

As of `f8d10c4b` (origin/develop, 2026-11-13). Found while getting 1.12.0's iOS e2e green (#659, #661, #662). Android runs the same flows against the same emulators without the problem.

What the instrumented run 43466583420 (shard job 132046511998) showed, FirebaseFirestore 12.18.0 on the simulator:

1. `[I-FST000001] WatchStream (…) Stream error: 'Unavailable: ping timeout'`; in other runs WatchStream and WriteStream fail together.
2. The app's own write is acked by the emulator.
3. On the resumed listen the emulator answers *current* without the doc written just before. The SDK reports `exists=false fromCache=false pending=false` and treats the doc as deleted. The emulator never sends it again.

So the app showed its own save immediately and lost it only after a server answer. This is CI infrastructure, not an app bug. Real Firestore does not answer a resume this way.

Runs: reproductions 43466583420 and 43466577646. Failures 43447342372 and 43433993304. Verifications after #662: 43481140813 (fallback fired and worked), 43497807883 (flow passed), 43481145635, 43497802681 and 43498007017 (failed later in flow 13: the my-cuota contact gate, the payment sheet's "25", and a fresh app that never showed "Explora" within 90 s).

Workarounds in place: flow 13 signs in again when the cuota disappears, and only flow 13 has a 20-minute cap (`FLOW_TIMEOUT_OVERRIDES_MS` in `scripts/lib/maestro-suite.mjs`).

## Leads (from the investigating worker, unverified)

- The iOS SDK hard-codes a 30 s gRPC keepalive (`grpc_connection.cc`, `GRPC_ARG_KEEPALIVE_TIME_MS 30000`). Native iOS has no long-polling or keepalive option (long-polling is JS SDK only). A "ping timeout" means the emulator's Java gRPC server did not answer in time. The likely cause is CPU starvation on the 3-core macOS runner, which also runs the Functions emulator, the simulator and Maestro.
- Things to try, in this order:
  1. give the Firestore emulator JVM more headroom (`JAVA_TOOL_OPTIONS` heap and GC), and log runner CPU around the timeouts;
  2. try a newer firebase-tools emulator;
  3. report the stale resumed-listen answer upstream to firebase-tools.
- Last resort, test build only: drop the stream and listen again from scratch after a stream error. Invasive.
- Once the root cause is fixed, delete the re-sign-in fallback and flow 13's cap override (*Delete > deprecate*).

## Status 2026-11-22

- Keepalive and ping enforcement are fixed and soaked. Three develop runs had 0 ping timeouts, 0 too_many_pings and 0 crash reports.
- Restore failures had a second cause: a Firestore emulator bug (1.19.8). A listener the app cancels stays registered. When a later write's rules re-read is denied, the emulator throws "call already cancelled" and the write answers 499. That hit restores, and once a server commit (deleteNewsPost).
  - #735 added read-back and retries.
  - #746 patches grpc's ServerCalls in a launcher jar (FIRESTORE_EMULATOR_BINARY_PATH, iOS only, EMULATOR_CANCELLED_LISTEN). It fails loudly if the patch isn't applied, and fails a shard on any such 499.
  - Removal condition and evidence: see the decision record `ios-e2e-emulator-keepalive.md`.
- #745 fixed flow 91's stale «Grupo de» assertion, which could never pass.
- Open:
  - Gate run 2's failures are not yet classified.
  - Two `simctl openurl` ETIMEDOUTs (flows 10, 71) passed on retry.
  - Flow 70's join request never appeared (unclassified; see `ideas/ios-e2e-unclassified-first-attempts.md`).
  - Whether android-e2e should opt into the patch.
  - The contact gate: 5 of 17 runs stuck.
- After this plan: the e2e ideas waiting on these files are `e2e-callable-cold-start`, `e2e-user-switch-without-reinstall` and `ios-e2e-unclassified-first-attempts`. Flows 12:5,15 and the subflow `grupos-chat-admins-only.yaml:1` still say "Solo la junta escribe" in comments. The setting is now shown as «Escribir en la Charla».
