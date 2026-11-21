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

## Not this: "Network connectivity changed"

The keepalive fix leaves about one other SDK stream error per shard:
`WatchStream … Stream error: 'Unavailable: Network connectivity changed'`.
It is the SDK restarting its streams because the Simulator's network path
changed. It is not a dropped write. The iOS SDK (12.18.0) handles it like this:

- `remote_store.cc`: the connectivity callback calls `RestartNetwork()`, which
  sets the online state to `Unknown` (not `Offline`) and reopens both streams at
  once. In ios-e2e 44764961074 they were back within 0.45 s.
- `view.cc`: `ApplyOnlineStateChange` changes a view only on `Offline`, so the
  restart leaves every query current.
- `query_listener.cc`: `ShouldRaiseEvent` passes a sync-state-only or
  pending-writes-only change only with `include_query_metadata_changes`. Our
  listeners (`packages/shared/src/services/watch.ts`) do not ask for it.

So a restart with no document changed raises no snapshot and no error, and no
screen re-renders or remounts because of it. A user switching between wifi and
mobile data does not lose taps or writes on this path.

In that same run, a flow 13 tap on the contact gate's accept button landed
0.37 s after a restart and did nothing. The gate stayed up 33 s with its button
idle. A local `setDoc` would have dropped the gate through its own listener, so
the app never received the tap. The cause is in Maestro or the Simulator, not in
the app. Whatever makes the Simulator's network path change on the runner is
an open question for the lane.

## When to delete it

Delete the drop-in, its wrapper hook and the opt-in once the emulator accepts
the SDKs' keepalive by itself. That happens when firebase-tools#11238 is fixed,
or when the emulator exposes the setting (then pass that instead). The probe
tells you which: run `node scripts/check-emulator-keepalive.mjs` against a stock
emulator. While it fails, keep the patch.

## A write must survive a listener the app dropped

The retry restore (`scripts/lib/emulator-snapshot.mjs`) clears the emulator and
writes the first attempt's documents back. Late in a shard every one of those
writes answered HTTP 499 `call already cancelled`. ios-e2e 44889372664 lost 85
of its documents after 3 attempts. 44901678360 lost 81 of 121 after 3, and
44914149484 lost 75 of 128 after 10 attempts, each of them answered 499. So
adding attempts could not fix it, and the shard ended on the spot. The same
failure hits the app's own saves (`commit`), though rarely: one in 44901678360.

**Cause, read from the 1.19.8 jar.** A listener the client cancels stays
registered: `CloudFirestoreV1ListenStream.onError` ignores `CANCELLED` and
never calls `ListenStreamManager.removeStream`. A later write notifies the
listeners on what it changed, inside the write. For a gone listener grpc-java's
`ServerCalls` throws `call already cancelled`, which `WrappedStreamObserver`
turns into `StreamTransportClosedException`. `notifyDocumentListeners` catches
that and drops the listener's target, which is fine. But when the listener's
re-read fails first (the rules now deny it the changed document, which the
restore's clear can cause by deleting the documents those rules read), the
manager tells the
listener its target was removed from **inside** its `catch (DatastoreException)`
block. The throw then escapes, and the write that caused it answers 499,
having applied some, all or none of its work. Production never fails a write
because a listener went away.

**Decision.** The lane runs the emulator with grpc-java's `ServerCalls` patched
on that one path, under `EMULATOR_CANCELLED_LISTEN=production`
(`scripts/lib/emulator-grpc.mjs`, `scripts/emulator-grpc/`). On a cancelled
streaming call, `onNext` drops the message when `ListenStream.notifyTargetRemove`
is on the stack, as grpc-java does for any call with an `onCancelHandler`.
Everywhere else it throws as before, so the emulator still drops gone listeners
the way it always has. No app code changes, and nothing restarts: Auth,
Functions, Storage, triggers and rules keep their state.

- **How it's loaded.** The class cannot go on the boot class path like the
  keepalive drop-in, because it links against the jar's own io.grpc and Guava.
  So it is compiled against the jar into a small launcher jar: its manifest
  names the emulator's `Main-Class` and puts the stock jar on its `Class-Path`.
- **How firebase-tools runs it.** Through its `FIRESTORE_EMULATOR_BINARY_PATH`
  override (`downloadableEmulators.js`). The stock jar is downloaded first with
  `firebase setup:emulators:firestore`.
- **Why not restart Firestore before a restore.** The hub cannot restart one
  emulator. A Firestore the suite ran itself would lose the triggers and rules
  that firebase-tools registers only at start-up: `functionsEmulator.js` ignores
  a Firestore trigger while that emulator is not running.

**The guard.** A run never falls back to the stock jar silently. Each of these
fails it:

- The launcher cannot be built.
- The jar's `ServerCalls` classes differ from ours in name or API (`javap`).
- The start-up probe fails. `scripts/check-emulator-cancelled-listen.mjs`
  listens to an active news post without credentials and cancels the listener,
  then hides the post, which the rules no longer let it read, and requires that
  write to answer 200. The stock emulator answers 499.
- After the suite, `run-ios-e2e.mjs` counts the writes `firestore-debug.log`
  shows failing that way, split by operation (`commit` for the app's own saves,
  `batchWrite` and `clearData` for the restore), and fails the shard on any.
  #735's read-back and its per-restore "answered 499" count stay. With the fix,
  that count should read 0.

**When to delete it.** Run the probe against a stock emulator after each
firebase-tools bump: `node scripts/check-emulator-cancelled-listen.mjs --host …`.
Once it passes, the emulator no longer fails a write over a gone listener.
Delete `scripts/emulator-grpc/`, `scripts/lib/emulator-grpc.mjs`, the probe and
the `EMULATOR_CANCELLED_LISTEN` opt-in. A bump whose jar no longer matches the
copy stops the run: re-derive the copy from the grpc-java version that jar
carries.
