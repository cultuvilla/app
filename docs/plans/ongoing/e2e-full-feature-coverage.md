# E2E — full feature coverage

**Priority:** high — bugs reached production through flows the suite reports green
**Landed:** dev
**Gate:** none
**Next:** Stage 3 — village content: extend 61 (news) and one deep flow each for place, barrio, festival poster, history entry

## Goal

Every user-facing form and action is exercised end to end with **every field set, edited
and read back**, and CI fails when a new control ships without an E2E step that touches it.

## Context

Decided 2026-10-08 (user): "I don't only want that we test any flow e2e, but that for each
flow we touch as many things as possible … we not only create an event, we modify every
field, we add multiple organizers." The user found several production bugs after the 1.7.x
releases, behind a suite that was green.

The suite (24 Maestro flows, `apps/mobile/e2e/native/flows/`) is a set of shortest-path
smokes. Each walks one journey on defaults and asserts one or two Firestore fields:

- `60-create-publish-event` types a title, picks GPS location, accepts every default and
  checks `title`, `status` and `municipalityId`. Description, cover, end date,
  organizers, capacity, age limits, phone, payment, group size, attendees-public and
  private-to-org are never set; nothing is edited; nothing is read back on screen.
- `50-onboarding-complete-profile` fills the person form but asserts only that a
  `persons` doc exists — not one field value.
- **No E2E at all:** event edit/cancel; place create and edit fields; barrios;
  festival posters; history entries; village info and community settings (escudo,
  location, fiestas); org edit and join policy; persona create/edit/delete and own-profile
  edit; village role changes and Embajador transfer; org member removal; every Buzón
  *reject*; search and filters; vocabulary; censo; Wrapped; notification prefs.
- **Many controls have no `testID`**, so no flow could reach them: event description,
  cover and capacity; news cover; place/org description and type chips; every image
  picker; onboarding village/barrio pickers; poster-edit dates; the delete buttons of
  barrio, org, cartel, persona and event; every control on `/[pueblo]/editar`; detail
  header edit/share actions; Buzón reject buttons.
- **Nothing checks coverage.** `routes.test.ts` proves each `openLink` resolves; no test
  relates the app's controls to the flows.

So "green" today means *these paths don't crash on defaults* — not *the feature works*.

## Design

### 1. One deep flow per feature, not one flow per path

Each feature gets one lifecycle flow, split into named phase subflows so a failure names
its phase:

> **create** with every field set to a non-default value → **assert** every field in
> Firestore *and* on the detail screen → **edit** every field (change, clear optionals,
> add/remove an organizer, swap the image) → **assert again** → **view as another user**
> (what they see; that they cannot edit) → **delete/cancel** → **assert gone** from detail
> and feed.

A feature's lifecycle may span two flows of one tens group when it would pass
Maestro's 15-minute per-flow limit (`E2E_FLOW_TIMEOUT_MS`); the later one finds
the entity by a deterministic title. Phases live in `e2e/native/subflows/<feature>-<phase>.yaml` (`event-create-full.yaml`,
`event-edit-all.yaml`, …) — flat, because the iOS/Android hygiene tests read
`subflows/` one level deep. The flow file is the sequence;
assertion subflows are reused after create and after edit with different `env` values.

Existing shortest-path flows fold into these as phases and are deleted (*Delete >
deprecate*): 60 + 62 become the event flow; 20, 21, 22 and 80 become the registration
flow. Flows that prove a platform seam (00, 10, 11, 45, 95) stay as they are.

Assertions keep today's discipline: **Firestore is the strong assertion, the screen the
corroboration** — but now *both*, per field. Display matters: several kinds of bug
(wrong formatter, stale denormalized copy, field written but not rendered) only show on
screen.

### 2. A coverage ratchet CI enforces

A vitest test (`packages/shared/test/ci/e2eCoverage.test.ts`) that:

1. Extracts every `testID` from form and action surfaces — `apps/mobile/app/**` and
   `apps/mobile/components/feature/**`. Template IDs (`` `attendee-row-${id}` ``) become
   prefixes (`attendee-row-`).
2. Extracts every `id:` a flow or subflow taps, types into or asserts (string or regex).
3. Fails when a source `testID` is used by no flow **and** is not listed in
   `apps/mobile/e2e/native/uncovered.json`.
4. Fails when a listed id *is* now covered — the list may only shrink.
5. Fails when a flow uses an id that exists nowhere in source (a renamed control
   otherwise surfaces only as a slow on-device timeout).

`uncovered.json` starts as today's gap list, each entry with a `reason`. Two kinds of
reason are permanent and allowed: `"unit-tested: <test path>"` (validation detail
belongs in jest, see §4) and `"device-only: <why>"` (an OS share sheet, Google/Apple
sign-in). Everything else is debt the phases below burn down.

The ratchet only sees controls with a `testID`, so the same task adds a lint-style
check: an `Input`, `Switch`, `Pressable`-with-`onPress` or picker component inside
`app/crear/**`, `app/**/editar.tsx` and `components/feature/proposable/**` must carry a
`testID`. That keeps a new field from being invisible to the ratchet.

### 3. Seed what a deep flow needs, create what it tests

A deep flow **creates** the entity under test through the UI (that is the point) but may
lean on seeded *collaborators*: a second org to add as co-organizer, a second villager to
add as organizer, a seeded image file for pickers. Pickers need a fixed file on the
device — push one in the runner setup (`adb push` / `simctl addmedia`) and pick it by
testID, rather than driving the OS gallery UI.

### 4. What stays out of Maestro

Exhaustive validation (every bad date combination, birth-year bounds, price formats) is a
jest test of the form logic — fast and complete. Maestro proves **one** validation error
renders and blocks submit per form. Each such field is listed in `uncovered.json` as
`unit-tested:` with the test that owns it.

### 5. Sharding constraints

iOS runs four shards grouped by the tens digit, and a group never splits
(`scripts/lib/maestro-suite.mjs` `shardFlows`). Deep flows are longer, so:

- keep at least four tens groups of comparable runtime;
- give a heavy feature its own tens group rather than stacking two in one;
- a flow may depend only on the seed and earlier flows **of its own group**.

## Handoff

**Decided 2026-10-09 (user): run Stages 3 → 6 back to back without check-ins**, one PR per
stage (each landed via `pr:land` before the next starts), iterating with targeted
`flows=` dispatches on both platforms and the full suite only on the PR. Stop only for a
bug whose fix changes a product rule, or anything adding running cost (a new CI job or
iOS shard); fix undisputed bugs under `fix-bug` and report them.

Stage 0 baseline (2026-10-09): 334 testIDs, 65 touched by a flow, 269 listed in
`uncovered.json`, all `todo:`. Components that render several controls take one
`testID` and derive the rest, so the ratchet counts the caller's literal (a
`VillagePicker` row is `<id>-option-<municipalityId>`). `LocationField`'s inner
controls (`location-use-mine`, `location-confirm`) keep fixed ids — only one picker
is ever open. `MyVillagePicker` lost its hardcoded `village-dropdown-trigger`; the
event form now names it `event-village`.

Stage 1 (2026-10-09): the local AVD loop OOM-killed WSL during the Gradle APK
build (~5.8 GB), so flow iteration runs on dispatched `android-e2e` runs
(`gh workflow run android-e2e.yml --ref <branch> -f flows=60`, ~20 min). The
Android photo picker's cells are `com.google.android.providers.media.module:id/icon_thumbnail`.

Stage 1 iOS lessons (2026-10-08), all now in the shared subflows:
- The iOS keyboard is closed by a tap at `1%,30%`, not 2%: every `Pressable` has an
  8pt hitSlop, so a card 16pt from the edge is tappable from 8pt (2% of 402pt).
- An open keyboard lifts the sticky wizard footer over low fields, so a second tap on
  the same field can press Siguiente/Guardar. Re-run `scroll-to.yaml` (closes the
  keyboard, centres the target) before *every* tap after typing.
- A pressable card or chip is ONE iOS accessibility element whose text joins its
  children's; match text with `.*….*` (`see-text.yaml` does), and never assert
  `assertNotVisible` on exact text — it passes vacuously.
- Iterate with targeted dispatches on BOTH platforms
  (`gh workflow run ios-e2e.yml --ref <branch> -f flows=60,62,64,65`) and cancel the
  automatic full PR run until the fix works; a full ~70-min iOS run per push also
  pays for unrelated flakes (23, 70, 71, 72 time out on a slow macOS runner).
- Inside a bottom sheet never use `close-keyboard.yaml` (its iOS gutter tap hits the
  backdrop and closes the sheet): `close-sheet-keyboard.yaml` presses Enter, which only a
  single-line text field honours. Numeric and phone keypads have no return key, so put a
  number answer last, straight before a field outside the sheet's list.
- A callable's FIRST call boots its emulator worker; on the macOS runner the request has
  arrived 2+ minutes after the tap. Wait up to 3–5 minutes on any first-call result.
- Maestro's `checked:` reads `accessibilityState` on Android only.
- An element under a fixed top bar counts as visible too: centre it with
  `scrollUntilVisible` direction UP before tapping (the roster's Editar toggle).
- Android: the CI emulator sometimes drops `device offline` as the map picker loads
  after the location grant (2 of ~6 runs); a re-run passes.

## Feature matrix — target

`C` create · `E` edit · `D` display (screen) · `F` Firestore · `O` other-user view ·
`X` delete. ✅ today · ⬜ to do.

| Feature | Fields / actions to cover | C | E | D | F | O | X |
|---|---|---|---|---|---|---|---|
| **Event** | title, description, cover, organizers (+user, +org, remove), private-to-org, start/end date+time, location, village, sign-ups on/off + info, capacity, birth-year range, phone, payment, group size, attendees public, questions (each type, required, reorder, remove, options) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ cancel |
| **Registration** | self, dependent, inline new persona, phone, answers, group + open seat + share/cancel, seat claim, waitlist + promotion, unregister, organizer paid/remove | ✅ (date answer, group share/cancel ⬜) | — | ✅ | ✅ | ✅ roster as villager | ✅ unregister + organizer remove |
| **News** | title, category, cover, text + image blocks + captions, attribution | ✅ partial | ✅ category only | ⬜ | ✅ partial | ⬜ | ✅ |
| **Place** | images, name, description, type, location, contributors | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ✅ soft-hide |
| **Barrio** | images, name | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Festival poster** | images, year, title, start/end, contributors | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **History entry** | images + captions, title, date (BC, month, day), range, approximate, body, sources | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Organization** | images, name, description, type, members public, join policy; member removal; role change | ✅ name only | ⬜ | ⬜ | ✅ partial | ⬜ | ⬜ |
| **Org joining** | open join, approval request + approve **and reject**, invite link | ✅ | — | ✅ | ✅ | — | ⬜ reject |
| **Village** | info description; community escudo, location, description, fiestas (add/edit/remove); join; role promote/demote; Embajador transfer; organizer request with phone + motivation, approve **and reject** | ✅ join + request | ⬜ | ⬜ | ✅ partial | ⬜ | — |
| **Person** | onboarding every field (incl. nickname, public, birthplace, photo, bio, occupations, village/barrio); own-profile edit; dependent create/edit/delete | ✅ partial | ⬜ | ⬜ | ⬜ values | ⬜ public/private | ⬜ dependent |
| **Discovery** | feed search + village/date/sort/category filters; vocabulary search | ⬜ | — | ⬜ | — | — | — |
| **Vocabulary** | term, kind, definition, example, castellano | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | — |
| **Settings** | notification prefs, change email, delete account (a throwaway user, actually deleted) | ⬜ | — | — | ⬜ | — | ⬜ |

Censo and Wrapped get their own row once their controls have testIDs (Censo has almost
none today).

## File Structure

- Create `packages/shared/test/ci/e2eCoverage.test.ts` — the ratchet and the
  testID-required check (§2); the extraction lives in `scripts/lib/e2e-coverage.mjs`.
- Create `apps/mobile/e2e/native/uncovered.json` — the shrinking gap list, with reasons.
- Create `apps/mobile/e2e/native/subflows/<feature>/*.yaml` — phase subflows per feature.
- Create or replace flows under `apps/mobile/e2e/native/flows/` — one deep flow per
  feature row; delete the shortest-path flows they absorb.
- Modify form components to add missing `testID`s — `apps/mobile/app/crear/evento.tsx`,
  `app/crear/noticia.tsx`, `app/**/editar.tsx`, `components/feature/proposable/**`,
  `components/feature/PersonForm.tsx`, image pickers (`MultiImagePickerRow`,
  `ImagePickerField`, `EventCoverPicker`), `EntityDetailHeader.tsx`, `app/buzon/index.tsx`,
  `OrgJoinRequests.tsx`, `CommunitySettingsEditor.tsx`.
- Modify `scripts/data/seed-fixtures/e2e/fixtures.mjs` — collaborators (second villager,
  second org) and a picker image.
- Modify `scripts/run-android-e2e.mjs`, `scripts/run-ios-e2e.mjs` — push the picker image
  onto the device before the run.
- Modify `apps/mobile/e2e/native/README.md` — the deep-flow shape and the ratchet.
- Modify `packages/shared/test/ci/androidE2e.test.ts` if the flow-count floor or the
  "95 runs last" pin moves.

## Tasks

### Stage 0 — make gaps visible
- [x] Add missing `testID`s to every form control listed in Context (no behaviour change).
- [x] Write `e2eCoverage.test.ts` and seed `uncovered.json` with today's gaps, each with a reason.
- [x] Add the testID-required check for form surfaces.
- [ ] Ask the user for the production bugs they found; for each, record which matrix
      cell would have caught it and move those cells to the front of the stages below.

### Stage 1 — event (highest traffic; the user's example)
- [x] Seed collaborators + picker image; push the image in both runners (the seed already had them; `PICKER_IMAGES` stocks the picker).
- [x] `subflows/event-create-full.yaml`, `event-edit-all.yaml`, plus `pick-datetime`, `pick-photo`, `replace-text`, `see-text`; `scripts/assertDoc.js`.
- [x] Deep event flows `60-event-create` + `64-event-edit-and-cancel` replacing 60 (since split further into 60 create, 62 permissions, 64 edit, 65 private + cancel, each under the 15-minute limit on a slow macOS runner) — one flow for the whole life ran past Maestro's 15-minute per-flow limit. Sign-up with answers stays in 62 until Stage 2 absorbs it.
- [x] Green on android-e2e (run 37723123831: 60 in 9m20s, 64 in 11m11s).
- [x] Green on ios-e2e (run 37777784951: 60 in 8m59s, 64 in 9m21s). Landed in #538.
- [ ] Cover picking on iOS (PHPicker selector); Android-only today.
- [ ] Jest coverage for event validation (dates, birth-year bounds, capacity) listed as `unit-tested:`.

### Stage 2 — registration
- [x] Deep flows `20-registration-signup` + `21-registration-organize` replacing 20, 21, 22,
      62 and 80, on a seeded `signupEvent` with every option (phone, payment, birth-year
      window, a text/select/number/checkbox question, two seats). Green on android-e2e and
      ios-e2e (20 in ~9m, 21 in ~4m on iOS).
- [x] Found and fixed: on iOS the sign-up sheet covered the person form its "Crear una
      nueva persona" opens (the sheet now hides while its screen is out of focus).
- [x] Keep 23 (seat claim) as its own flow in the same group.
- [ ] A `date` question answer (the one answer type not driven; needs the DateField calendar
      inside a sheet).
- [ ] Group sign-up beyond 23: share/cancel a group, a group's answers.

### Stage 3 — village content
- [ ] News: extend 61 to cover, image blocks, attribution, display, other-user view.
- [ ] Place, barrio, festival poster, history entry: one deep flow each (C/E/D/F/O/X).

### Stage 4 — organizations and village governance
- [ ] Org: create with every field, edit every field, join policy flip, member removal, role change.
- [ ] Buzón rejects: organizer request, org approval, org join request.
- [ ] Village: info + community settings (escudo, location, fiestas), role promote/demote,
      Embajador transfer.

### Stage 5 — people and the rest
- [ ] Onboarding asserts every field value; own-profile edit; dependent create/edit/delete;
      public/private as seen by another user.
- [ ] Discovery: search and each filter.
- [ ] Vocabulary, notification prefs, change email, delete account (throwaway user).

### Stage 6 — close out
- [ ] `uncovered.json` holds only `unit-tested:` and `device-only:` entries.
- [ ] Re-check iOS shard balance (§5); update README.
- [ ] Retire this plan; distil the ratchet rationale into `docs/decisions/` if non-obvious.

## Constraints

- **CI runtime.** Longer flows lengthen the existing `android-e2e` / `ios-e2e` jobs; that
  is marginal. Adding a **fifth iOS shard** or a new job is a new running cost and needs
  the user's yes — rebalance tens groups first.
- **No product changes.** This plan adds testIDs and tests only. A bug a deep flow
  uncovers is fixed under `fix-bug` (pre-approved when the correct behaviour is not in
  dispute); one that implies a product rule goes to the user.
- **Stages land independently.** Each stage is useful on its own and merges on its own PR.
