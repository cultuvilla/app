# One Madrid-day cutoff for the feed and the completion sweep

**Priority:** low — one small live defect (the feed's "from today" cutoff follows the phone's clock, not Madrid's) and an hourly job whose reads grow with every event ever published

**Goal:** Put "the start of today in Europe/Madrid" in `EventDataModel` next to `madridDayKey`, and use it in the two places that cut events off by day: the home feed's `endBoundary >= today` query, and `completeExpiredEvents`, which then queries only the events whose day is over instead of reading every published event each hour.

## Context

As of `e6f84572` (origin/develop, 2026-11-21):

- Event day rules already live in one place, `packages/shared/src/models/event/EventDataModel.ts`: `EVENT_TZ = 'Europe/Madrid'`, `madridDayKey`, `isStartDayOver`, `eventEndBoundary` (`endDate ?? startDate`), `upcomingThenPast`, `isEventOngoing`. Mobile, functions and the read site call them (the read site's own copy went in 3c6c8f50, under `ongoing/read-site-shared-list-rules`).
- Two callers still do the day cut on their own:
  - `packages/shared/src/services/feedService.ts` `startOfToday()` is `new Date()` + `setHours(0, 0, 0, 0)` — the **device's** local midnight. `upcomingFeedQuery` (public feed) and `orgUpcomingQuery` (private feed, used by `getPrivateUpcomingFeed` / `watchPrivateUpcomingFeed`) filter `where('endBoundary', '>=', Timestamp.fromDate(startOfToday()))`. On a phone in another timezone (Canarias, one hour behind; an emigrant in Buenos Aires or Mexico City; a phone east of Madrid) the cutoff moves by hours. The visible effect is that events of the **current Madrid day** drop out early: a phone east of Madrid cuts off events earlier in the day, a phone west of Madrid cuts off the small hours (a 00:30 verbena disappears from a Canarian phone at 00:00 Canarias = 01:00 Madrid). The opposite case, yesterday's events lingering, is mostly masked: the hourly sweep flips them to `completed` and the `status == 'published'` filter drops them. `docs/decisions/event-news-ownership-and-single-date.md` already binds this: "Date/"ongoing" logic must go through `isStartDayOver` — do not compute end-of-day inline in device-local or UTC time."
  - The feed screen keys its listeners by the device date (`apps/mobile/app/(tabs)/index.tsx`: `const today = new Date().toDateString()` in the `useWatch` keys), so the subscription also rolls over at device midnight, not Madrid's.
  - `functions/src/events/eventCompletion.ts` `completeExpiredEvents` (`onSchedule('every 1 hours')`) reads `eventsCollection(db).where('status', '==', 'published').get()` — every published event, including every future one — and recomputes `toDate(data.endDate ?? data.startDate)` inline instead of reading the stored `endBoundary` (which `firestore.rules` already requires to equal `endDate ?? startDate`). It then awaits one `update` per expired event in sequence. Reads per run grow with the catalogue, not with what expired.
- The index the narrower query needs already exists: `firestore.indexes.json` declares `events (status, endBoundary)`.
- `functions/src/__tests__/handlers/completeExpiredEvents.test.ts` pins the Madrid-day boundary (`NOW = 2026-06-15T22:30:00Z`, already 16 June in Madrid) against the emulator, so the sweep's behaviour is locked independently of how it queries.

## Design

- **`startOfMadridDay(now: Date): Date`** (new export in `EventDataModel.ts`, illustrative name): the instant at which `madridDayKey(now)` began, computed with `Intl` for `EVENT_TZ` (handles CET/CEST). Unit-tested in `packages/shared/test/` across both DST switch days and a non-Madrid `TZ`.
- **Feed:** `feedService.ts` drops its private `startOfToday()` and filters on `startOfMadridDay(new Date())`; the Inicio screen keys its two `useWatch` subscriptions by `madridDayKey(new Date())` instead of `toDateString()`, so they roll over at Madrid midnight.
- **Sweep:** `completeExpiredEvents` queries `status == 'published' && endBoundary < startOfMadridDay(now)`, which is exactly the set `isStartDayOver(endBoundary, now)` selects, and writes the updates with a `BulkWriter` (or batched writes) instead of one awaited `update` at a time.

**Alternatives considered:** fixing only the feed (leaves the sweep reading the whole catalogue hourly, with the same day rule spelled a third way); querying on `startDate` in the sweep (wrong for multi-day events — `endBoundary` exists precisely for that).

**Testing strategy:** a vitest for `startOfMadridDay` (DST edges, a process `TZ` other than Madrid); the existing `completeExpiredEvents` emulator test stays as the contract, plus one case proving a future published event is not read-modified; a feed test (or the existing feed service test) asserting the cutoff for a pinned clock in a non-Madrid `TZ`.

## Paths

- `packages/shared/src/models/event/EventDataModel.ts`
- `packages/shared/src/services/feedService.ts`
- `functions/src/events/eventCompletion.ts`
- `functions/src/__tests__/handlers/completeExpiredEvents.test.ts`
- `apps/mobile/app/(tabs)/index.tsx` (listener day key)
- `packages/shared/test/models/event/EventDataModel.test.ts` (extend with the day-start cases)

## Approval

Pre-approved — "fixing a defect whose correct behaviour is not in dispute — a crash, a leak, a wrong result, code that breaks its own docs or tests — unless the fix changes a product rule" (the feed's cutoff disagrees with the app's own Madrid-day rule, `EVENT_TZ`), and "debt and refactors that change nothing observable (below)" (the sweep completes the same events, reading fewer).

## Out of scope

- `EventSeriesModel.ts` `startOfDay`, `utils/format.ts` relative-day counts and `apps/mobile/lib/date/calendarGrid.ts`: these are calendar arithmetic on the user's own clock (date pickers, "in 3 days"), not the Madrid cutoff, and are left alone.
- Changing when an event counts as over (still the end of its last Madrid day).
