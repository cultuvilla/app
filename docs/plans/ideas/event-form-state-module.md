# Event form state as one pure, tested module

**Priority:** medium — the event form is the hottest screen in the app (churn 21, 5 fix commits), and a new event field has to be added in four hand-synced places inside it

**Goal:** Move the event form's draft (its fields, prefill from an existing event, derived rules and the create/update payloads) out of `apps/mobile/app/crear/evento.tsx` into one pure module with direct jest tests. A new field then lands in one place, and a bug in how the payload is derived fails a plain unit test instead of a 22-mock screen render.

## Context

As of `129efeb7` (origin/develop, 2026-11-20); the evidence window is 90 days.

- `apps/mobile/app/crear/evento.tsx` has 1338 lines, churn 21 and 5 fix commits. Its `NewEventScreen` holds about 47 `useState` hooks and four effects. The form's logic sits between those hooks and the JSX.
- **The same field list is written four times in the one component:**
  1. The edit-mode prefill effect (`getEvent` → about 35 setters).
  2. The copy-mode prefill effect (`copyFrom`, next year's edition → about 28 setters, mostly the same ones).
  3. The `updateEvent(eventId, {...})` patch inside `useCallable`.
  4. The `createEvent` / `createEventSeries` input in the same callable.

  So `signupInfo`, `minBirthYear`, `attendeesVisibility`, `signupFields`, `organizerOrgIds` and the others are each converted (string ↔ number, `!== false`, `'members' | 'organizers'`) once per place. A field added in three places and missed in the fourth fails silently.
- **Derived rules are inline expressions in the render body:** `visibilityOrgId`, `seriesFrequency` / `seriesRule` / `slotEnd`, `seriesUntilInvalid`, `birthYearOutOfBounds` / `birthYearRangeInvalid`, `signupsWouldBeWiped`, and the `usableSignupFields` filter (it trims labels, drops blank options and keeps locked rows).
- **What the fix commits broke:**
  - `7a6c4ffe` fix(events): keep a series day's stored visibility on edit. This is a pure derivation bug: `visibilityOrgId` came from the organizer orgs even on a series day, so the rules refused the whole edit. A unit test on the derivation would have caught it.
  - `26a85e07` fix: never put a private event's title in a URL. The post-save redirect skipped `eventLinkTarget`. It was fixed in the shared link builders; the value fed to them is the same derived `visibilityOrgId`.
  - `ec919b81` (closing the #578 series review findings, mostly rules; on the form it hides the private switch on series days), `662bef38` (keyboard avoidance) and `9e2229f6` (the `operation` label for error logging) are UI or infrastructure fixes that a pure module would not have caught.

  So 1–2 of the 5 fixes are logic bugs this module targets. The rest of the case is the four-place field list. Feature commits keep landing here (`2d470a65` varying dates, `4f45e058` the frequency sheet, `91e3b8b7` recurring events and tasks, `c499dd23` group screens), and the idea `event-prices-socio-tiers` would add more fields.
- **Tests today:** `apps/mobile/app/crear/__tests__/evento.test.tsx` is 1449 lines, about 50 cases and 22 `jest.mock`s. Many cases render the whole stepper only to check what reached the mocked `createEvent` or `updateEvent`: private events, the birth-year window being dropped, form questions being dropped, series visibility, the monthly series rule, the copy-mode prefill.
- **A dead duplicate of the rules:** `packages/shared/src/models/event/EventFormSchema.ts` (zod, with hardcoded Spanish messages) is used at runtime by nothing. The screen imports only its two constants, `MIN_EVENT_BIRTH_YEAR` and `MAX_EVENT_BIRTH_YEAR`. Its refinements are the rules the screen applies by hand: `signupInfo` only with in-app sign-ups off, and a birth-year window only with them on. Only `packages/shared/test/models/EventFormSchema.test.ts` and `test/models/event/birthYearWindow.test.ts` exercise the schema.
- **No shared shape with the other forms:** `apps/mobile/app/crear/noticia.tsx` (527 lines, 13 `useState`) and `[pueblo]/entidad/[entidad]/editar.tsx` (204 lines, 10 `useState`) have one prefill and one payload each, with no duplication worth abstracting. This plan is about the event form only. A generic form-draft helper would be speculative.

Dependency category: **in-process.** The draft, the prefill, the derivations and the payload builders are pure computation, so they can be merged into one module and tested directly.

## Design

**Chosen shape (B, the common caller trivial):** add one module, `apps/mobile/lib/events/eventDraft.ts`, next to the existing `birthYearLabel.ts` and `seriesLabel.ts`. It is app-only: the studio does not author events, and the draft holds UI-shaped values such as typed strings and `EventTaskDraft` rows. It owns:

- `EventDraft`: one object type for every editable field, as the inputs hold them (`maxAttendees: string`, `minBirthYear: string`, `recurrence`, `repeatWeekdays`, `signupFields`, `organizerOrgIds`, …).
- `blankEventDraft(now, uid, organizerOrgId?)`: the create-mode defaults that the `useState` initialisers hold today.
- `draftFromEvent(ev, { mode: 'edit' | 'copy', uid })`: the single prefill, replacing the two effects' setter lists.
  - Copy mode: dates shift a year (or clear when the date varies), the uid goes first among the organizers, and `recurring` is on.
  - Edit mode: the locks (`lockedFieldCount`, `groupSizeLocked`, the existing sign-up count) and the loaded series facts.
- `deriveEventDraft(draft, loaded)`: the derived values the steps and the submit read.
  - `visibilityOrgId` (a series day keeps its stored value).
  - The series rule, `slotEnd`, `repeatsYearly` / `repeatsMonthly`.
  - The validity flags each step's `validate` reads today: `birthYearOutOfBounds`, `birthYearRangeInvalid`, `seriesEndInvalid`, `seriesUntilInvalid`.
  - `signupsWouldBeWiped`.
- `buildEventUpdate(draft, derived, ctx)` and `buildEventCreateInput(draft, derived, ctx)`. Both share one private `commonFields()`, so each converted field is written once: trimmed text, `maxAttendees` as a number, the birth-year window dropped when sign-ups are off, `signupInfo` nulled while sign-ups are on, `usableSignupFields`, `attendeesVisibility`, `visibility`.

The screen holds the draft as one state object through a small `set(field, value)` updater (for example `useState<EventDraft>` with a field setter, or `useReducer`). Each prefill effect becomes one `setDraft(draftFromEvent(...))`, and the callable calls the two builders. The submit orchestration stays in the screen unchanged: series versus single, the cover upload under the first id, the retry refs `createdEventIdsRef` / `tasksCreatedRef`, and the group tasks. So do the stepper JSX, the village loading and the capability redirect.

The birth-year constants move to `EventDataModel.ts` next to `MAX_SIGNUP_GROUP_SIZE`. `EventFormSchema.ts` and its test are deleted (*Delete > deprecate*), and the comments that name it are repointed at `EventDataModel`: `firestore.rules` (the birth-year bounds, "keep the two in step") and the two in `evento.tsx`'s submit. Its exported types `EventFormInput` / `EventFormValues` have no importer in the app, studio or functions. The invariants they assert are re-asserted against `buildEventCreateInput` and `buildEventUpdate`. Where the schema and the screen disagree, the screen's shipped behaviour survives: the screen normalises (it drops a note or window that doesn't apply), while the schema rejects. The schema's rejection was never reachable from any client.

Illustrative only:

```ts
export function buildEventCreateInput(
  d: EventDraft,
  x: DerivedEventDraft,
  ctx: { uid: string; village: { id: string; name: string; coordinates: LatLng | null }; location: LocationData; existingImageURL: string | null; hasNewCover: boolean },
): Omit<EventDataInput, 'villageSlug' | 'series'>;
```

Nothing a user sees changes: the same fields, steps, validation messages, payloads and navigation. The existing screen tests must pass unmodified before any of them move. That is the refactor's proof.

**Alternatives considered:**
- **A, minimal interface:** keep the 47 `useState`s and extract only the builders and derivations, as functions taking a dozen arguments. It loses because the two ~28–35-setter prefill effects, the largest duplicate, would stay in the screen, and every builder signature would restate the field list a fifth time.
- **C, ports and adapters around the submit:** a `submitEventDraft(deps)` with the event, image and task services injected, making the retry logic unit-testable. It loses for now: nothing crosses a runtime boundary that the screen tests don't already cover through the service mocks, and those tests already prove the retry (`does not create a second event when the cover upload fails`). It is a reasonable follow-up if the submit grows.
- **A form library (`react-hook-form` + zod):** out of scope. AGENTS.md *Forms* keeps that an open call.

**Testing strategy:**
- Add `apps/mobile/lib/events/__tests__/eventDraft.test.ts` (jest, no mocks). It covers:
  - Prefill round-trips for edit and copy: copy shifts a year, clears a varying date and puts the uid first.
  - `visibilityOrgId` across one org, two orgs, a stale toggle and a series day (the `7a6c4ffe` case).
  - The series rule for weekly and monthly, `slotEnd`, and the until bounds.
  - The birth-year flags, `signupsWouldBeWiped`, and the `usableSignupFields` filter (locked rows kept verbatim, blank options dropped).
  - The payload invariants `EventFormSchema.test.ts` and `birthYearWindow.test.ts` carried for the form: no note while sign-ups are on, and no window while they are off.
- Then move the screen cases that only inspect a payload down into this file: private events created public or private, no window once the limit is switched off, no questions once the form is off, a series day keeping its visibility, the monthly series start, the copy-mode prefill. Delete them from `evento.test.tsx` rather than keeping both.
- The screen test keeps the wiring: step gating, which controls show, the sign-up-wipe confirm, cover upload and retry, task creation, the redirect URL, and one end-to-end create and one update as a smoke check.
- Keep the `birthYearWindow.test.ts` cases that test `EventDataModel` (`buildEventData`, `birthYearEligibility`); drop only its `EventFormSchema` cases.
- No QA entry: nothing user-visible changes, and the unchanged screen suite plus the new unit suite prove it.

## Paths

As of 2026-11-20:

- `apps/mobile/app/crear/evento.tsx`
- `apps/mobile/app/crear/__tests__/evento.test.tsx`
- `apps/mobile/lib/events/eventDraft.ts` (new)
- `apps/mobile/lib/events/__tests__/eventDraft.test.ts` (new)
- `apps/mobile/components/feature/EventTasksEditor.tsx` (only if `EventTaskDraft` / `blankEventTask` move next to the draft; optional)
- `packages/shared/src/models/event/EventFormSchema.ts` (deleted)
- `packages/shared/src/models/event/EventDataModel.ts` (receives `MIN_EVENT_BIRTH_YEAR` / `MAX_EVENT_BIRTH_YEAR`)
- `packages/shared/src/models/event/index.ts`
- `packages/shared/test/models/EventFormSchema.test.ts` (deleted)
- `packages/shared/test/models/event/birthYearWindow.test.ts`
- `firestore.rules` (comment only: the birth-year bounds point at `EventFormSchema`)

## Approval

Pre-approved:

- "debt and refactors that change nothing observable (below);"
- for retiring the unused `EventFormSchema`: "consolidating duplicates into one source of truth — where the copies disagree, only if the surviving behaviour is the documented or tested one;". The surviving behaviour is the shipped screen's, which `evento.test.tsx` tests.

No stored shape, payload, copy or flow changes. No hard-stop path is touched.

## Out of scope

- Adopting `react-hook-form`, zod-driven form validation or any form library (an open call in AGENTS.md *Forms*).
- `crear/noticia.tsx` and the entity `editar` screens: each has one prefill and one payload, so there is nothing comparable to consolidate.
- Splitting the stepper's JSX into per-step components. That is a separate, cosmetic cut that this plan makes easier but does not need.
- Moving the submit orchestration (series, cover upload, retry refs, group tasks) behind injected ports (alternative C).
- Any change to which fields an edit may touch, the rules, or the payload.
