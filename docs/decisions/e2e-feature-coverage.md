# E2E — one deep flow per feature, and a coverage ratchet

**Decided:** 2026-10-08 (user); shipped across Stages 0–6, closed 2026-10-14.
Builds on [e2e-testing-substrate.md](e2e-testing-substrate.md) (seeded fixtures,
Firestore assertions, Maestro on real builds).

## Context

After the 1.7.x releases the user found production bugs behind a green suite.
The 24 Maestro flows were shortest-path smokes: each walked one journey on
defaults and checked one or two Firestore fields. Event edit, places, barrios,
posters, history, village settings, org edit, personas, role changes, every
Buzón *reject*, search and vocabulary had no E2E at all. Many controls had no
`testID`, so no flow could have reached them. Nothing measured any of this, so
"green" meant *these paths don't crash on defaults*, not *the feature works*.

## Decision

**One deep flow per feature.** Create with every field set to a non-default
value → assert each field in Firestore *and* on screen → edit every field →
assert again → view as another user → delete. Firestore is the strong
assertion, the screen the corroboration, and both are checked: a wrong
formatter, a stale denormalized copy or a field written but not rendered only
shows on screen. A lifecycle that would pass Maestro's 15-minute per-flow limit
splits across two flows of one tens group (60/62/64/65, 84/85, 31/33, 51/54),
and the later flow finds the entity by a deterministic title.

**A coverage ratchet in `pnpm test`**
([e2eCoverage.test.ts](../../packages/shared/test/ci/e2eCoverage.test.ts),
extraction in [scripts/lib/e2e-coverage.mjs](../../scripts/lib/e2e-coverage.mjs)).
Every `testID` in the app is either touched by a flow or listed in
[uncovered.json](../../apps/mobile/e2e/native/uncovered.json). The list may only
shrink; a flow may not name an id the app lacks; and an input on a form surface
must carry a `testID`, or it would be invisible to the ratchet.

**A gap has exactly two honest reasons.** `unit-tested: <test>` means jest owns
it: validation detail (every bad date, birth-year bounds) and states a device
cannot reach on demand. The test must exist and name the id. `device-only:
<why>` means an OS surface Maestro can't drive (the push-permission dialog).
`todo:` was the backlog while the stages ran. The regenerator still writes it
for a new control, and the test rejects it, so a new control ships with a flow
step or a reason.

**Flows create what they test and lean on seeded collaborators.** The entity
under test is made through the UI. A second villager, a second org, a cemetery,
burial personas and picker images come from the e2e seed
([scripts/seed/e2e.mjs](../../scripts/seed/e2e.mjs)).

## Bugs it found (all fixed)

- **News:** delete was offered to every co-writer, but only the author or an
  admin may delete, so a co-writer's delete failed silently (flow 80).
- **Groups:** delete was offered to every org admin, but the rule admits only
  village and app admins, so the refusal came with no message (flow 74).
- **Photo rows:** a horizontal photo row filled the poster edit screen, which
  left the fields and save button off screen (flow 83).
- **Sign-up on iOS:** the sign-up sheet covered the "new persona" form it opens
  (flow 20).
- **Village description:** a description typed just before closing was lost
  (flow 31).
- **Organizer picker:** a failed villager or group list never loaded again
  (flow 60).
- **New-group form on iOS:** the form couldn't scroll or close its keyboard, and
  the roster's row actions didn't name the member (flows 70 and 74).
- **Profile read at sign-in:** a read that failed counted as "no profile", so a
  signed-in user landed on "Completa tu perfil", where cancelling deletes what
  it takes for a fresh account (flow 84 on iOS, under an overloaded emulator).
- **Group type:** the edit screen offered type chips the rules refused to save
  (flow 74). Decided with the user to allow peña ↔ asociación ↔ otros.

## Harness lessons worth keeping

- `confirm-alert` anchors on the alert's question, matched without a `/`: an
  image URL on the screen beneath is a "?" too, and the whole alert (labelled
  with its title) then matched as the button. Flow 85 never passed on iOS until
  this was found.
- On iOS a flow cannot sign out mid-run: `clearState` keeps the keychain
  session. A signed-out check belongs in a flow that starts signed out (00).
- `scroll-to` closes the keyboard by tapping the margin, which closes a bottom
  sheet. Inside a sheet, tap the field directly.
- `tap-until` re-taps where its target was. When the next screen puts
  something else there (the edit action becomes the trash), use a plain tap.

## What binds

- A new control: a flow step, or a `unit-tested:` / `device-only:` reason.
- A new flow: depends only on the seed and earlier flows of its own tens group
  (iOS shards by tens group), and stays under 15 minutes on a macOS runner.
- iOS quarantine is capped at three flows by
  [iosE2e.test.ts](../../packages/shared/test/ci/iosE2e.test.ts).
- Both platforms run on four shards of whole tens-groups (`shardFlows`); a
  shard takes about 35–75 minutes on Android and 40–60 on iOS.

## Known gaps

Each is honest in `uncovered.json` or in a quarantine reason. None is hidden.

- **iOS Simulator, open:** a non-admin villager's news list never loads
  (55 quarantined), and photo uploads through PHPicker don't land on the shared
  runners (83 quarantined; other content flows pick photos on Android only).
  Both still need reproducing on a real iPhone.
- **Unit-tested only:** the Wrapped (built server-side from a finished fiesta,
  so it can't be reached on demand in a run), group answers and the
  `date`-question answer in a sheet.

## Rejected

- **Shortest-path flows plus a high flow count.** The count was never the
  problem; what each flow left untouched was.
- **Validation exhaustively in Maestro.** It is minutes per case on a device
  and milliseconds in jest. Maestro proves that one error renders and blocks
  submit.
- **A fifth iOS shard.** Tens groups were rebalanced instead.
- **One serial Android job.** It ran ~2.5 h, and a runner lost two hours in took
  every result with it. Split into four shards (decided 2026-10-10, user).

## Revisit when

- The iOS quarantine reaches its cap, or either open Simulator issue reproduces
  on a device.
- A shard approaches its 120-minute timeout: rebalance tens groups before
  adding a fifth shard, which is new running cost.
