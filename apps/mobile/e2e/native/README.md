# Native E2E (Maestro on Android and iOS)

The app's end-to-end suite, described in
[docs/decisions/e2e-testing-substrate.md](../../../../docs/decisions/e2e-testing-substrate.md):
seeded fixtures, assertions on Firestore emulator state rather than the view
hierarchy, Maestro driving the real Android and iOS builds. **One set of flows
serves both platforms** — see [iOS](#ios) for the little that differs. It is the only E2E suite —
the Playwright web suite went with the Expo web build
(docs/decisions/web-is-a-read-site.md).

## In CI

[.github/workflows/android-e2e.yml](../../../../.github/workflows/android-e2e.yml)
runs the whole suite on an AVD, gated to the **beta/main release paths** — a Gradle build plus an emulator boot is far too slow for
day-to-day `develop` PRs, and `beta` is the release candidate, the last point
where a native-only regression can be caught before it becomes a store binary.
`workflow_dispatch` is enabled so a native regression can be chased from any
branch without waiting for a promotion PR.

[.github/workflows/ios-e2e.yml](../../../../.github/workflows/ios-e2e.yml) runs
the same suite on an iOS Simulator, on a macOS runner (free: the repo is
public). Same release-path gating, plus one trigger Android lacks: a `develop`
PR that touches the iOS harness or anything under `e2e/native/` runs it too,
because macOS is the only place it can run at all.

### Shards (iOS)

One machine took ~2.5 h for the iOS suite: Maestro restarts its iOS driver for
every flow. So `ios-e2e` builds the Simulator app **once** (`build` job, shared
as an artifact) and runs the flows on **four machines** (`suite` matrix, `iOS
E2E shard i/4`). Each shard boots its own Simulator, emulators and seed, and
runs the flows `shardFlows` (in [scripts/lib/maestro-suite.mjs](../../../../scripts/lib/maestro-suite.mjs))
gives it:

- **Whole tens-groups, never split.** Order inside a group is load-bearing
  (21 organizes what 20 signed up; 95 runs after the other 9x flows), and a
  shard starts from a fresh seed, so a split group would lose its first half.
  The flip side: **a flow may only depend on the seed and on earlier flows of
  its own group.** State that "lasts the rest of the run" (90 hides the seeded
  place) lasts the rest of that shard.
- **Deterministic.** Groups go largest-first to the least-loaded shard, so a
  shard number always means the same flows for the same suite. The shard's log
  prints its list (`[ios-e2e] shard 2/4: …`).
- `E2E_SHARD=i/N` reproduces one locally. It composes with a selection: a
  dispatched `flows=20,21` lands on one shard, and the others exit before
  booting.

Debugging a red `iOS E2E shard 3/4`: its artifact is
`maestro-artifacts-ios-shard-3`, with one JUnit report and the Maestro
screenshots per flow, uploaded even when the job timed out. Every Maestro call
is bounded (`E2E_FLOW_TIMEOUT_MS`, 15 min), so a wedged driver fails one flow
instead of the whole shard.

## The flows

| Flow | What only this can prove |
|---|---|
| `00-anonymous-deep-link` | The substrate boots: APK + emulator-connect + seed + deep-link routing, before any interaction. |
| `10-login-and-profile` | The native fixture-login seam, then auth → `users/{uid}` → `persons/{id}` → rendered. |
| `11-otp-login` | The real login screen: email → 6-digit code (read from the emulator's `authOtpCodes` doc) → signed in. Every other flow uses the fixture seam. |
| `20-registration-signup` | Every sign-up option on one seeded event: self + dependent with one answer of each type, the required-answer and bad-phone refusals, the birth-year warning, a private persona created from the sheet and waitlisted; registrations, their private half (phone + answers) and the trigger-maintained `confirmedCount` asserted; a villager's roster view (anonymised, no answers or controls). |
| `21-registration-organize` | The organizer's roster: every answer, the private name, paid, the call sheet, removing an attendee promotes the waitlisted one (trigger); then the attendee cancels through a native `Alert`. Depends on 20 (same tens group). |
| `23-seat-claim` | A group booking leaves a seat open; a second user opens its claim link (`…/plaza/<token>`) and takes it. |
| `30-village-join` | A rules-gated direct client write, and the UI flip that follows it. |
| `31-village-settings` | A village's info description (callable), escudo (square crop), location, description and fiestas (two added, one removed, one renamed and moved), by an app admin; a villager off the team sees the result and is turned away from the editor. Depends on 30. |
| `32-village-roles` | A villager promoted onto the pueblo's team, demoted, then handed the Embajador title; member doc, audit log and roster badges checked each time. Depends on 30. |
| `40-entity-comments` | RN `TextInput` + soft keyboard + send round trip. |
| `41-report-and-block` | Report a comment, block its author (their comment disappears), unblock from settings — the UGC controls App Review requires. |
| `45-offline-cached-village` | Airplane mode + cold relaunch paints profile and village from the persistent cache; a rename made while offline shows only once back online. |
| `50-onboarding-complete-profile` | The three-step person form with native `Modal`/`FlatList` pickers and step gating. |
| `60-event-create` | An event created with every field: cover, organizers (a villager + two orgs), dates, capacity, age range, phone, payment, groups, private roster, questions; every stored field and the detail screen asserted. Also the OS location permission and a real GPS fix (`setLocation`). |
| `62-event-permissions` | 60's event as its other users see it: the co-organizer may edit; a villager may only read, and the edit link sends them back. Split from 60 to keep it under Maestro's 15-minute limit on a slow runner. |
| `64-event-edit` | The same event with every field edited, down to private to the approval peña; the doc and the screen asserted again. Depends on 60 (same tens group). |
| `65-event-private-and-cancel` | The now-private event: the villager gets "not found"; then the organizer cancels it. Depends on 60 and 64. |
| `61-news-lifecycle` | Create → edit → hard-delete of a news post, the delete behind a native `Alert`. |
| `63-private-event-feed` | A peña member sees the peña's private event on the home feed, though they also belong to an open org whose private-events query the rules refuse. |
| `70-org-create-approve-join` | A villager proposes a group with every field (photo, description, type, private roster) and a bare one; the village admin approves the first and rejects the second from the Buzón; a third user joins the approved one. |
| `71-organizer-request-approval` | Two Embajador requests — one with a typed phone and a motivation — rejected and approved by a super admin; the approved requester becomes the village's admin and Embajador. |
| `72-org-join-request` | Joining an `approval` peña: two join requests, one admitted and one turned down by the org admin from the Buzón (callable). |
| `73-org-invite-link` | An org invite link (`…/unirse`) opens the org with the invitation banner; joining an open org is instant. |
| `74-org-edit-and-members` | 70's group edited by its founder (photo swapped, every field, roster public, joining by approval); a member promoted, demoted and removed (callables); the removed member must now ask to join and cannot edit; the group deleted. Depends on 70. |
| `90-content-soft-hide` | Deleting a place from its edit screen soft-hides it. Runs late: it hides the seeded place. |
| `91-delete-account-blockers` | The sole-admin blockers shown before an account can be deleted. |
| `95-app-version-gate` | The force-update gate: a dismissible nudge, then a wall that BACK cannot escape. Runs last; deletes `config/appVersion` on the way out. |

Filename order is load-bearing: `21` organizes what `20` signed up. Every flow
still starts from `clearState: true`, so one failure never cascades into a bogus
second one. [../../../../packages/shared/test/ci/androidE2e.test.ts](../../../../packages/shared/test/ci/androidE2e.test.ts)
fails the build if a flow is added without a numeric prefix.

## Running only some flows

Both platforms take a comma-separated selection — numeric prefixes, names or
filenames: `20,21`, `20-registration-signup`, `61-news-lifecycle.yaml`. It runs in
**filename order** whatever order you typed (a pair like 20 → 21 still works),
runs a quarantined flow if you name it, and fails fast on a name that matches
nothing rather than passing on zero flows. Mind the pairs: `21` alone has
nothing to organize — select `20,21` (and `60,62,64,65`).

| Where | How |
|---|---|
| Locally | `E2E_NATIVE_FLOW=20,21 pnpm test:e2e:android` (or `:ios`), or `--flow 20,21` on the runner script |
| CI, from a terminal | `pnpm e2e:ci:android -f flows=20,21 --ref <branch>` / `pnpm e2e:ci:ios -f flows=20,21 --ref <branch>` |
| CI, from GitHub | Actions → `android-e2e` / `ios-e2e` → *Run workflow* → fill **flows** |

On CI the build still dominates (~15 min Android, ~35 min iOS), so a targeted
run saves the suite's ~20 minutes, not the build's. Empty **flows** = the whole
suite, as on every non-dispatch event.

## Quarantine

`scripts/run-android-e2e.mjs` holds a `QUARANTINED` map of flows that are **not
run** by the gate, each with the reason. Every run prints what it held out, twice
— once up front and once in the summary — because a suite that quietly shrank
reads as "everything passed", which is worse than a red lane. Naming a flow
in a [selection](#running-only-some-flows) still runs a quarantined flow, so chasing one needs no edit.

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

They poll, and Maestro's JS runtime has no sleep, so between attempts they
call a pause endpoint the runner serves on `127.0.0.1:9399`
([scripts/lib/poll-pause-server.mjs](../../../../scripts/lib/poll-pause-server.mjs)).
Polling back to back starved the 3-core macOS runner: a callable the app sent
during a poll only began executing once the poll gave up. Without the server
(running a flow by hand) the call fails at once and the poll is merely tight.

They run on the **host**, not on the device, so they use `127.0.0.1` even though
the app inside the AVD reaches the same emulator at `10.0.2.2`.

`assertDoc.js` checks many fields of one doc in a single call — scalars, arrays
as sets, lengths, prefixes, indexed paths (`signupFields.0.label`) — and fails
the step with the full diff; a deep flow uses it after every create and edit.
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

Some flows only, against whatever build is already installed — see
[Running only some flows](#running-only-some-flows):

```bash
node scripts/run-android-e2e.mjs --flow 20,21
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
| A flow that changes device state | Airplane mode or a global doc (`config/appVersion`) outlives the flow — and the app's `clearState` — so every later flow fails for a reason it cannot see. | Undo it in `onFlowComplete`, and add the doc to `LEFTOVER_DOCS` in `scripts/lib/maestro-suite.mjs`: before each flow the runner turns airplane mode off and deletes those docs, since `onFlowComplete` never runs when Maestro itself dies. |
| The OTP send cap | `sendAuthOtpCode` allows 5 sends per address per 15 minutes, and a capped send still answers `ok` without writing a new code — so a flow re-run against the same emulator reads a stale code and passes or fails on its 10-minute expiry, not on the login screen. | Re-run `11-otp-login` on a fresh `pnpm test:e2e:android`, not repeatedly against one emulator. |
| A floating button over the bottom band | `RegisterFab` sits outside the scroll view over the screen's bottom band, so a field that `scrollUntilVisible` leaves near the bottom edge can have its centre under the FAB: the tap focuses nothing, and `inputText` arrives as raw key events into an unfocused window (on CI it tore the activity down). | Scroll to the end of the content (explicit `swipe`s) before tapping a field that is last on the page — the content's bottom padding lifts it clear. |
| Text selectors match the WHOLE string | `Apuntado` misses "Apuntado (1)"; `Perfil` matches both the tab and the screen header. | Use a regex (`Apuntad.*`) or a `testID`. |

## Adding a flow

Give the file the next numeric prefix and make the **strong** assertion against
Firestore state via `runScript` (`queryCollection.js` returns the first match's
`id`, for a flow that must navigate to a server-generated doc). Stamp any title
it creates with `Date.now()` so a re-run never matches a leftover. Any id or
title referenced in YAML must stay in sync with
`scripts/data/seed-fixtures/e2e/fixtures.mjs` by hand — Maestro YAML cannot
import JS.

## Coverage ratchet

Every `testID` in the app is either touched by a flow or listed in
[uncovered.json](uncovered.json) with a reason, and that list may only shrink.
[e2eCoverage.test.ts](../../../../packages/shared/test/ci/e2eCoverage.test.ts) runs
in `pnpm test` and fails when:

- a new control ships with a `testID` no flow touches and the list doesn't name;
- a listed id is now covered or gone (the list must shrink with it);
- a flow taps an id that exists nowhere in the app;
- an input-like control on a form surface (`app/crear/**`, `**/editar.tsx`, the
  proposable forms, `PersonForm`, …) has no `testID` at all.

After a flow covers more, regenerate the list with
`node scripts/lib/e2e-coverage.mjs --write`. Reasons are `todo: …` (debt),
`unit-tested: <test>` (validation detail jest owns) or `device-only: <why>`
(an OS share sheet, Google/Apple sign-in). A component that renders several
controls takes one `testID` and derives the rest (`<id>-option-<x>`,
`<id>-remove-<i>`); the ratchet tracks the caller's literal.

The aim is one deep flow per feature — create with every field, assert each in
Firestore *and* on screen, edit every field, view as another user, delete. See
[the plan](../../../../docs/plans/ongoing/e2e-full-feature-coverage.md).

## iOS

The same flows, run by [scripts/run-ios-e2e.mjs](../../../../scripts/run-ios-e2e.mjs)
against a Simulator build from
[scripts/build-ios-e2e-app.mjs](../../../../scripts/build-ios-e2e-app.mjs). The
ordered loop and the quarantine announcement are shared with Android
([scripts/lib/maestro-suite.mjs](../../../../scripts/lib/maestro-suite.mjs)), as
is the emulator-armed build env
([scripts/lib/e2e-build-env.mjs](../../../../scripts/lib/e2e-build-env.mjs)), so
"green" means the same thing on both. Each platform keeps its own quarantine:
a flow can fail on one transport and pass on the other.

What differs, and where:

| Difference | Handled in |
|---|---|
| The Simulator shares the Mac's network, so the app reaches the emulators on `127.0.0.1` — no `10.0.2.2` alias. ATS still governs that HTTP, so the build sets `NSAllowsLocalNetworking` in the generated `ios/` tree only. | `build-ios-e2e-app.mjs` |
| The native SDK reads its project from `GoogleService-Info.plist`; the build writes a copy re-pointed at the test project. | `lib/e2e-build-env.mjs` + `app.config.ts` |
| iOS asks "Open in …?" the first time a custom-scheme link targets the app. Accepting is permanent per Simulator, so the runner answers it once before the suite, and the flows' `openLink` stays the same on both platforms. | `ios/trust-deep-links.yaml` |
| No BACK key, and no safe keyboard dismissal: Maestro's iOS `hideKeyboard` is unreliable, and a tap on blank margin closes a bottom sheet (it hits the backdrop). `subflows/reveal.yaml` presses BACK only under `platform: Android`; on iOS it relies on `KeyboardAvoider` keeping the target above the keyboard, and just scrolls. | `subflows/reveal.yaml` |
| The location prompt reads "Allow While Using App". | `subflows/allow-location.yaml` |
| `clearState` wipes the app's files but **not the keychain**, where Firebase Auth keeps the session — so a flow inherited the previous one's user. The runner resets the Simulator keychain before every flow. | `run-ios-e2e.mjs` |
| A Pressable is an accessibility element, and on iOS it hides its descendants: a sheet whose backdrop/catcher Pressables were accessible exposed its whole card as ONE element, so no testID inside it existed for XCUITest (or VoiceOver). Both wrappers are `accessible={false}`, enforced by `pressCatcherAccessibility.test.ts`. | the sheets |
| Entitlements: the unsigned Simulator build needs `application-identifier` for Firebase Auth's keychain, linked into a `__TEXT,__entitlements` section the way Xcode does it — never into the signature, which the Mac kernel then refuses to launch. | `build-ios-e2e-app.mjs` |
| A tab's accessibility label is `Explora, tab, 1 of 3`, and Maestro matches the whole string — so a bare `'Explora'` never matches on iOS. Tab labels are matched as `'Explora(,.*)?'`. | `subflows/login*.yaml` |
| The screen under a native Alert stays in the hierarchy, so a header icon labelled like the alert's button (the trash, "Eliminar") also matches — and `rightOf: 'Cancelar'` alone picked it. The confirm is anchored `below` the alert's question (any text with a "?") too. | `subflows/confirm-alert.yaml` |
| A tap right after a deep-linked screen appears is dropped: Maestro reports COMPLETED, nothing opens. `subflows/tap-until.yaml` taps, waits for what the tap should open, and taps again if it is not up. | `subflows/tap-until.yaml` |
| A tap on an input right after its screen appears may not focus it, and keystrokes can drop while the keyboard settles. `subflows/type-into.yaml` types, checks the field shows the whole text, and retypes. | `subflows/type-into.yaml` |
| The screen is narrower, so a horizontal row's third card can sit wholly past the right edge, where no vertical scroll reaches it. Swipe the row itself (it carries a `testID`). | `63-private-event-feed` |

**iOS quarantine** (reasons in `run-ios-e2e.mjs`): `45-offline-cached-village`
(airplane mode is Android-only in Maestro) and `50-onboarding-complete-profile`
(keyboard choreography tuned to the AVD).

Writing a flow: anything platform-specific goes in a `runFlow: when: platform:`
branch, preferably in a subflow. `iosE2e.test.ts` fails the build on an
unguarded `pressKey: back`.

Locally (macOS + Xcode 26.4+ only):

```bash
pnpm app:ios:e2e-app                                  # prints the .app path last
E2E_IOS_APP=<that path> pnpm test:e2e:ios             # emulators + seed + suite
node scripts/run-ios-e2e.mjs --flow 20-registration-signup.yaml   # one flow
```
