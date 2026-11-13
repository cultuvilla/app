# iOS e2e: Firestore emulator watch streams time out on the macOS runner

**Priority:** medium — makes flow 13 (and likely any long, write-heavy iOS flow) flaky; iOS e2e is not a required check, so it erodes trust in the lane rather than blocking merges

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
