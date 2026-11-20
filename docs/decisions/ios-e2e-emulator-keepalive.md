# The Firestore emulator runs with production's gRPC keepalive policy in ios-e2e

In `ios-e2e`, the Firestore emulator's gRPC server accepts the Firestore SDKs'
30-second keepalive pings, as production does. The stock emulator does not, so
the lane changes that one setting and fails whenever the change stops holding.

## Problem

On the iOS Simulator, the Firestore SDK's streams died with `Unavailable: ping
timeout` (sometimes `GOAWAY received … too_many_pings`) three to eight times per
shard. Each time a write stalled for about 90 seconds. That made flows 13–15
flaky on iOS, while Android ran the same flows without failing.

## Cause

Two defaults that disagree:

- **The SDKs ping every 30 s.** iOS 12.18.0 sets `GRPC_ARG_KEEPALIVE_TIME_MS`
  to 30 000 in `Firestore/core/src/remote/grpc_connection.cc`, on gRPC-Core 1.69.
  Android's `GrpcCallProvider` uses `keepAliveTime(30, SECONDS)`. Production
  Firestore accepts that.
- **The emulator allows one ping per 5 minutes.** The jar
  (`cloud-firestore-emulator-v1.19.8`, firebase-tools 14.27) builds its server
  with grpc-java's `NettyServerBuilder` defaults (`io.gapi.emulators.grpc.GrpcServer`):
  `permitKeepAliveTime` 5 min, no pings while no call is open, two strikes.
  Strikes reset only when the server sends data. The third early ping gets
  `GOAWAY ENHANCE_YOUR_CALM too_many_pings`, and the connection is closed. The
  jar has no flag, system property or environment variable for this. The same
  class and defaults are in jar 1.22.0 (grpc-java 1.84).

The stall came from the client's ping budget. gRPC-Core sends at most two pings
without data of its own, then holds the next one. A save sends data, so the held
ping goes out with the write, before the emulator has replied. That is the third
strike: the emulator drops the connection together with the write. The Simulator
often missed that close. The write then waited for the next keepalive ping,
30 s later, and that ping's one-minute timeout: about 90 s in all. Android's grpc-java client sees the GOAWAY at
once and reconnects, so the same rejection never showed there.

## Evidence

- **Local reproduction.** `scripts/check-emulator-keepalive.mjs` sends three
  HTTP/2 PINGs to the stock jar. The third is answered with GOAWAY
  `too_many_pings`. With the policy below, all three are acked.
- **The wire.** A loopback capture of the stock emulator in CI (ios-e2e
  44763114283, flow 15) shows the whole stall. At 17:03:00.376 the app sends a
  write and its held keepalive PING in the same burst. At 17:03:01.331 the
  emulator acks the PING, then sends `GOAWAY ENHANCE_YOUR_CALM too_many_pings`
  and a FIN. The client never acts on them. Its next keepalive PING, at
  17:03:31, gets a TCP RST. Sixty seconds after that, at 17:04:34, the SDK logs
  `ping timeout` on the Watch and Write streams together, then reconnects. The
  write waited 94 s.
- **CI timelines.** In 13 runs of flows 12–15, each ~90 s stall started at a
  save tap and ended with `ping timeout` on the Watch and Write streams together:
  `cuota-settings-save` +92–98 s, `task-save` +88–92 s. Flow 15's failure
  ("`cosa-sheet` is still visible") is the same stall: its sheet waits 20 s for
  a write that has not been acked.
- **Upstream.** [firebase-tools#11238](https://github.com/firebase/firebase-tools/issues/11238)
  reports the same GOAWAY after ~90 s and the same late write against jar 1.22.0
  and Apple SDK 12.19.2.
- **What it was not.** Emulator heap and GC pauses (≤ 1 s), the emulator JVM's
  CPU (1–2 %, reniced), a lighter runner (#715) and a newer jar: none of them
  changed the count (#710, #715).

## Decision

- **A drop-in for grpc-java's `KeepAliveEnforcer`**
  ([scripts/emulator-keepalive/](../../scripts/emulator-keepalive/io/grpc/internal/KeepAliveEnforcer.java)).
  It keeps grpc-java's logic and API and changes only the two limits: pings
  every 10 s or more are accepted (a third of the SDKs' 30 s), with or without a
  call open. [emulator-keepalive.mjs](../../scripts/lib/emulator-keepalive.mjs)
  compiles it and puts it ahead of the jar's own class with
  `-Xbootclasspath/a`. The boot class loader resolves it first and cannot see
  the jar's Guava, so the copy depends on `java.*` only.
- **Opt-in, for the emulator JVM only.** `EMULATOR_KEEPALIVE=production` makes
  [run-tests-with-emulators.mjs](../../scripts/run-tests-with-emulators.mjs) add
  the flags to the emulator's `JAVA_TOOL_OPTIONS`. Maestro is a JVM too, so the
  flags never reach it. `ios-e2e.yml` opts in. The Android lane and the unit
  suites do not need it today, so they do not opt in.
- **The test, not the app.** No app or SDK code changes. The emulator moves
  toward production; the app's behaviour on a dropped stream stays exactly what
  users get.

## The guard

The lane fails, rather than warns, on each way this can regress:

1. **Before seeding**, the wrapper checks that the jar's `KeepAliveEnforcer`
   still has the API the copy replaces (`javap` on both). It probes the emulator
   with three pings 11 s apart. It requires the copy's
   `[emulator-keepalive] client pings permitted every 10000 ms` line in
   `firestore-debug.log`. A firebase-tools bump that renames, reshapes or stops
   using the class stops the run here.
2. **After the suite**, `run-ios-e2e.mjs` fails the shard if the SDK logged a
   single `ping timeout` or `too_many_pings`, even when every flow passed. It
   writes the reason to the job summary.
3. [iosE2e.test.ts](../../packages/shared/test/ci/iosE2e.test.ts) locks the
   opt-in, the JVM-only scope, the order of the checks, the shard guard and the
   probe's verdicts.

## When to delete it

Delete the drop-in, its wrapper hook and the opt-in once the emulator accepts
the SDKs' keepalive by itself. That happens when firebase-tools#11238 is fixed,
or when the emulator exposes the setting (then pass that instead). The probe
tells you which: run `node scripts/check-emulator-keepalive.mjs` against a stock
emulator. While it fails, keep the patch.
