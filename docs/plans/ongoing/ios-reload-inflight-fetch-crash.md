# iOS: a JS reload with a fetch in flight crashes the app

**Priority:** high — a native crash (SIGSEGV) instead of a restart, reachable on every iOS sign-out and on the first signed-in launch after a reinstall
**Landed:** dev
**Gate:** soak:the 3 ios-e2e develop runs from 44826311824 (with #719) upload no Dev-*.ips with `RuntimeScheduler::scheduleTask` or `destroy for JavaScriptPromise`. Before #719 it crashed in 6 of about 8 shard-1 runs, and 1 in about 7 purge reloads, so 3 clean runs is meaningful
**Next:** read those runs' DiagnosticReports; clean → retire, distilling the cause into a decision record. If the crash recurs, the residual paths are a body read slower than 2 s or a fetch reference captured before startup; then also file the upstream Expo issue (draft in #719's body)

**Goal:** `clearLocalCacheAndRestart()` restarts the JS runtime without ever crashing, whatever requests are in flight.

## Context

Found by w18 on 2026-11-20 in ios-e2e diag run fix-6b (44788829839, flow 12). The crash report is `Dev-2026-11-20-190912.ips` (pid 58069): EXC_BAD_ACCESS at 0x0 on thread `expo.modules.fetch.RequestQueue`, in `ExpoFetchModule NativeResponse.state didSet → Promise.reject → JavaScriptPromise.reject → expo::RuntimeScheduler::scheduleTask → facebook::react::RuntimeScheduler::scheduleTask` (null). Two `com.facebook.react.runtime.JavaScript` threads were alive at once: one destroying a Hermes runtime, one starting a new one. So the JS host was reloaded about 12 s into a cold start, and an in-flight `expo/fetch` request then settled onto the torn-down runtime's scheduler. Expo 56 (`~56.0.12`) installs expo/fetch as the global `fetch` (`expo/src/winter/runtime.native.ts`), so any fetch can do this.

The app reloads its JS only through `clearLocalCacheAndRestart()` → `Updates.reloadAsync()` (`apps/mobile/lib/auth/clearLocalCache.ts`). Callers:
- every sign-out (`AuthContext.tsx`);
- `purgeRunawayQueueOnce(signedIn)` (`apps/mobile/lib/push/purgeRunawayQueue.ts`, called from `PushProvider.tsx`). Its once-flag lives in AsyncStorage, which a reinstall wipes, while the Firebase Auth session lives in the iOS Keychain and survives one. So the first launch after a reinstall comes up signed in, finds no flag, and wipes and reloads. That is inferred from the code, not yet seen in a log.

## Design

1. Confirm the trigger: add trace lines in `purgeRunawayQueueOnce` and `clearLocalCacheAndRestart` on a diag branch, or read existing logs.
2. Make the reload safe. Candidates, in order of preference:
   - fixed upstream in an Expo 56 patch release → bump within `~56.0.x`;
   - quiesce before reloading: abort or await in-flight fetches (a small registry around the global fetch, or the Firebase/SDK calls that use it), then call `reloadAsync`;
   - avoid a reload where it isn't needed: decide whether the purge must run after a reinstall at all, given the Keychain-surviving session (e.g. key the once-flag so a fresh install doesn't count as "not yet purged" when there is nothing to purge).
3. If it's an Expo bug, file or link the upstream issue in the PR.

**Testing strategy:** unit tests for the quiesce or trigger logic; the ios-e2e lane's new crash-report upload (848ae62a) shows any recurrence with its stack.

## Paths

`apps/mobile/lib/auth/clearLocalCache.ts`, `apps/mobile/lib/push/purgeRunawayQueue.ts`, `apps/mobile/lib/push/PushProvider.tsx`, their tests; `apps/mobile/package.json` only for an Expo patch bump (a native change: see the `expo-native-rebuild` skill). `AuthContext.tsx` only if the sign-out path must change.

## Approval

Pre-approved — "fixing a defect whose correct behaviour is not in dispute — a crash". Restarting instead of crashing is not a change in what users see.

## Out of scope

Changing when the app signs users out or what the purge removes.

## Outcome so far (2026-11-20)

#719 (5f6e6230, 324aacb6): before `reloadAsync`, the app aborts requests still waiting for headers and awaits open body reads, for at most 2 s. Past that it logs one warn with counts and reloads anyway. The trigger was confirmed in diag run 44811349099 (comment on #719): `purgeRunawayQueueOnce signedIn=true flag=null` on the first launch after a reinstall, then `reloadAsync` at 21:27:03.419. NetInfo's generate_204 request was then cancelled (-999), and the app hit SIGSEGV in `destroy for JavaScriptPromise`. Six other purge reloads in that run did not crash, so it is a race. No Expo patch fixes it as of 56.0.24 / modules-core 56.0.27.
