# Native E2E (Maestro on Android)

The app's end-to-end suite, described in
[docs/decisions/e2e-testing-substrate.md](../../../../docs/decisions/e2e-testing-substrate.md):
seeded fixtures, assertions on Firestore emulator state rather than the view
hierarchy, Maestro driving the real Android build. It is the only E2E suite —
the Playwright web suite went with the Expo web build
(docs/decisions/web-is-a-read-site.md).

## In CI

[.github/workflows/android-e2e.yml](../../../../.github/workflows/android-e2e.yml)
runs the whole suite on an AVD, gated to the **beta/main release paths** — a Gradle build plus an emulator boot is far too slow for
day-to-day `develop` PRs, and `beta` is the release candidate, the last point
where a native-only regression can be caught before it becomes a store binary.
`workflow_dispatch` is enabled so a native regression can be chased from any
branch without waiting for a promotion PR.

## The flows

| Flow | What only this can prove |
|---|---|
| `00-anonymous-deep-link` | The substrate boots: APK + emulator-connect + seed + deep-link routing, before any interaction. |
| `10-login-and-profile` | The native fixture-login seam, then auth → `users/{uid}` → `persons/{id}` → rendered. |
| `11-otp-login` | The real login screen: email → 6-digit code (read from the emulator's `authOtpCodes` doc) → signed in. Every other flow uses the fixture seam. |
| `20-register-to-event` | Sign-up through the attendee sheet; registration doc **and** the trigger-maintained `confirmedCount`. |
| `21-register-family-member` | The multi-persona model — signing up a dependent. |
| `22-unregister-from-event` | A real native `Alert.alert` confirmation. |
| `23-seat-claim` | A group booking leaves a seat open; a second user opens its claim link (`…/plaza/<token>`) and takes it. |
| `30-village-join` | A rules-gated direct client write, and the UI flip that follows it. |
| `40-entity-comments` | RN `TextInput` + soft keyboard + send round trip. |
| `41-report-and-block` | Report a comment, block its author (their comment disappears), unblock from settings — the UGC controls App Review requires. |
| `45-offline-cached-village` | Airplane mode + cold relaunch paints profile and village from the persistent cache; a rename made while offline shows only once back online. |
| `50-onboarding-complete-profile` | The three-step person form with native `Modal`/`FlatList` pickers and step gating. |
| `60-create-publish-event` | The event wizard (3 steps; Preguntas appears only with sign-ups on *and* the form toggle on), including the OS location permission and a real GPS fix (`setLocation`). |
| `61-news-lifecycle` | Create → edit → hard-delete of a news post, the delete behind a native `Alert`. |
| `62-event-signup-questions` | The wizard with the form on: a Preguntas step, then an attendee answers it; the answer lands in `registrationPrivate`. |
| `70-org-create-approve-join` | Three actors: a peña proposed, approved from the Buzón, then joined. |
| `71-organizer-request-approval` | An Embajador request approved by a super admin; the requester becomes a village admin. |
| `72-org-join-request` | Joining an `approval` peña: a join request, admitted by the org admin from the Buzón (callable). |
| `73-org-invite-link` | An org invite link (`…/unirse`) opens the org with the invitation banner; joining an open org is instant. |
| `80-waitlist-promotion` | A full event waitlists a sign-up; removing a confirmed attendee promotes it (trigger). |
| `90-content-soft-hide` | Deleting a place from its edit screen soft-hides it. Runs late: it hides the seeded place. |
| `91-delete-account-blockers` | The sole-admin blockers shown before an account can be deleted. |
| `95-app-version-gate` | The force-update gate: a dismissible nudge, then a wall that BACK cannot escape. Runs last; deletes `config/appVersion` on the way out. |

Filename order is load-bearing: `22` unregisters what `20` registered. Every flow
still starts from `clearState: true`, so one failure never cascades into a bogus
second one. [../../../../packages/shared/test/ci/androidE2e.test.ts](../../../../packages/shared/test/ci/androidE2e.test.ts)
fails the build if a flow is added without a numeric prefix.

## Quarantine

`scripts/run-android-e2e.mjs` holds a `QUARANTINED` map of flows that are **not
run** by the gate, each with the reason. Every run prints what it held out, twice
— once up front and once in the summary — because a suite that quietly shrank
reads as "everything passed", which is worse than a red lane. `--flow <name>`
still runs a quarantined flow, so chasing one needs no edit.

Currently held out: **nothing**. `50-onboarding-complete-profile` was held out
while the app talked to the emulators through the Firestore JS SDK, whose
cleartext connection to `10.0.2.2` dropped mid-write and left "Crear perfil"
spinning. On `@react-native-firebase` (the native SDK) it passes, and it was
put back in the gate on 2026-10-06.

## Backend assertions from Maestro

`scripts/docField.js` and `scripts/queryCollection.js` read the Firestore
emulator's REST API and poll until the expected state appears, using the
`Authorization: Bearer owner` rules-bypass (without it, a read of a rule-protected
collection returns empty and the assertion fails against a backend that is
actually correct).

They run on the **host**, not on the device, so they use `127.0.0.1` even though
the app inside the AVD reaches the same emulator at `10.0.2.2`.

`docField.js` reads one scalar; a dotted `FIELD` walks into maps, and a `*`
segment takes a map's first key (for maps keyed by generated ids, such as
registration answers). Three scripts write, for state a flow must set up or
undo — `clearState` resets the app, never Firestore, so anything a flow leaves
behind is seen by every flow after it:

- `setField.js` — one string field, leaving the rest of the doc as it is;
- `appVersionConfig.js` — the whole `config/appVersion` doc, in the strict
  shape its converter needs (a doc missing a field makes the gate fail open);
- `deleteDoc.js` — for `onFlowComplete` cleanup, which runs even when the flow fails.

## The login seam

Maestro drives the UI and cannot call into the app's JS context, so the web
suite's `window.__cultuvillaE2E` is unreachable. Credentials arrive over the
app's own URL scheme instead:

```
cultuvilla://?e2eLogin=<email>%7C<password>
```

**One** parameter, pipe-separated, because `adb shell am start -d` eats an
unescaped `&` — a two-parameter link would arrive with the password missing.
It is handled by the same armed predicate and the same
`signInWithEmailAndPassword` primitive as the web seam, in
[../../lib/auth/AuthContext.tsx](../../lib/auth/AuthContext.tsx). The query lands
on the index route, which ignores unknown params, so no new screen or route
exists for it.

## Why `10.0.2.2` and not `127.0.0.1`

On an Android emulator `127.0.0.1` is the *device*. The AVD reaches the host
loopback — where the Firebase emulators listen — at the alias `10.0.2.2`.
`scripts/build-android-e2e-apk.mjs` bakes it in via `EXPO_PUBLIC_EMULATOR_HOST`.

That alias is also the **only** widening of the fixture-login's host allowlist
(see `isE2EEmulatorHost` in [../../lib/auth/e2eLoginLink.ts](../../lib/auth/e2eLoginLink.ts)):
it is non-routable and AVD-only, so a physical device or a real network has
nothing there.

## Running it locally

```bash
# 1. Build the standalone, emulator-armed APK (~4 min warm, x86_64 only).
pnpm app:android:e2e-apk

# 2. Boot an AVD, then run the whole thing: Firebase emulators + seed + suite.
E2E_ANDROID_APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk \
  pnpm test:e2e:android
```

One flow at a time, against whatever build is already installed:

```bash
node scripts/run-android-e2e.mjs --flow 20-register-to-event.yaml
```

### Under WSL2

The AVD runs on the **Windows** host (see the `drive-android-avd` skill), which
costs two extra steps:

1. **adb.** The Windows adb server must be reachable from WSL. Start it with
   `adb.exe -a -P 5037 nodaemon server` (binds `0.0.0.0`) and forward WSL's
   `127.0.0.1:5037` to the Windows host IP, so Maestro's default lookup finds it.
2. **Emulator bind host.** `10.0.2.2` resolves to the *Windows* loopback, where a
   WSL process bound to `127.0.0.1` is invisible. Pass `EMULATOR_BIND_HOST=0.0.0.0`
   so the Firebase emulators bind to all interfaces:

   ```bash
   EMULATOR_BIND_HOST=0.0.0.0 E2E_ANDROID_APK=… pnpm test:e2e:android
   ```

Neither applies on a Linux runner, where the AVD and the emulators share one
loopback — which is why CI leaves both unset and exposes nothing.

Three more traps, all hit on a full local run (2026-10-06):

- **Launch the `-a` adb server as a Windows process**, e.g.
  `powershell.exe -Command "Start-Process -WindowStyle Hidden -FilePath <sdk>\platform-tools\adb.exe -ArgumentList '-a','-P','5037','nodaemon','server'"`.
  Started from a WSL shell, it died mid-suite, every transport dropped at once,
  and the next flow failed with `Network closed` / `EOFException`. That looks like
  a broken flow, but it isn't one.
- **Any `offline` device hides every device from Maestro.** Its adb library
  (dadb) throws on the first transport it cannot open, and Maestro then reports
  `Device emulator-5554 is not connected` even though `adb devices` lists it. A
  phone stuck `offline` after the adb server restarts is enough. Re-authorise
  or unplug it, and pin `E2E_ANDROID_DEVICE=emulator-5554`.
- **Run the Maestro version CI runs** — `MAESTRO_VERSION` in
  [android-e2e.yml](../../../../.github/workflows/android-e2e.yml). Maestro 2.4
  rejects non-ASCII `inputText` (`Unicode not supported: Peña…` in flow 70).
  Install the pinned one with `curl -Ls https://get.maestro.mobile.dev | MAESTRO_VERSION=<v> bash`
  (the variable must reach `bash`, not `curl`)
  (it needs `unzip`), or point `MAESTRO_BIN` at it.

## Maestro traps this suite already paid for

Every one of these cost real debugging time. They are encoded in the flows with
comments; this is the index.

| Trap | What it looks like | What to do |
|---|---|---|
| `hideKeyboard` is a **BACK press** | A later step fails with "element not found" while the app sits on the launcher — `inputText` on an AVD with a hardware keyboard never raises a soft keyboard, so the BACK walks out of the screen. | Don't use it. |
| `retry:` still fails the flow | Every command reads COMPLETED and the flow is reported FAILED anyway (Maestro 2.4 records the failed attempt inside the block). | Use `runFlow: when:` — a skipped conditional records nothing. |
| `scrollUntilVisible` on an unscrollable screen | Burns its timeout and fails, naming a field that was visible all along. | Wrap it in `runFlow: when: notVisible:`, or drop it. |
| A centre-tap lands on the wrong child | Tapping a consent row opens the legal screen instead of ticking the box; tapping an icon-sized adornment reports COMPLETED while the handler never fires. | Target the inner element (`accept-terms-box`), or trigger the same handler another way (`pressKey: Enter` on an input with `onSubmitEditing`). |
| The bare `cultuvilla://` | The app never starts. expo-dev-client is a plain dependency, so its launcher activity exists even in the release APK and claims the schemeless link. | Always name a route. |
| An intent to a cold-starting app | Silently dropped — the JS listener has not mounted yet. | Launch first, wait for the tab bar, then send the link. |
| The first tap with the soft keyboard up | Reports COMPLETED, but only closed the keyboard; the button's handler never ran (the login screen's "Enviar código"). | `repeat: while: notVisible: <next step>` around the tap. |
| A flow that changes device state | Airplane mode or a global doc (`config/appVersion`) outlives the flow — and the app's `clearState` — so every later flow fails for a reason it cannot see. | Undo it in `onFlowComplete`, and add the doc to `LEFTOVER_DOCS` in `run-android-e2e.mjs`: before each flow the runner turns airplane mode off and deletes those docs, since `onFlowComplete` never runs when Maestro itself dies. |
| The OTP send cap | `sendAuthOtpCode` allows 5 sends per address per 15 minutes, and a capped send still answers `ok` without writing a new code — so a flow re-run against the same emulator reads a stale code and passes or fails on its 10-minute expiry, not on the login screen. | Re-run `11-otp-login` on a fresh `pnpm test:e2e:android`, not repeatedly against one emulator. |
| `scrollUntilVisible` stops at the first visible pixel | On a short screen a field ends up on the bottom edge against the tab bar; the tap focuses nothing and `inputText` arrives as raw key events into an unfocused window (on CI it tore the activity down). | `centerElement: true` before tapping an input. |
| Text selectors match the WHOLE string | `Apuntado` misses "Apuntado (1)"; `Perfil` matches both the tab and the screen header. | Use a regex (`Apuntad.*`) or a `testID`. |

## Adding a flow

Give the file the next numeric prefix and make the **strong** assertion against
Firestore state via `runScript` (`queryCollection.js` returns the first match's
`id`, for a flow that must navigate to a server-generated doc). Stamp any title
it creates with `Date.now()` so a re-run never matches a leftover. Any id or
title referenced in YAML must stay in sync with
`scripts/data/seed-fixtures/e2e/fixtures.mjs` by hand — Maestro YAML cannot
import JS.
