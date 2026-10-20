# Weekly recurring events are one event per occurrence, tied by a `series` block

## Context

Organizers run things that happen every week — yoga on Tuesdays and
Thursdays, a weekly mercadillo, a taller every Saturday morning — and had to
create each date by hand. Each date also needs its own life: people sign up
for *this* Tuesday, and a single day gets cancelled when it rains or the
teacher is ill, without touching the rest.

## Decision

- **Materialize every occurrence as an ordinary `events/` doc** at create time.
  Each one carries `series: { id, index, weekdays, until }`; standalone events
  carry `series: null`. `series.id` is the first occurrence's doc id. Sign-ups,
  rosters, comments, share links, reminders, `completeExpiredEvents` and the
  read site all keep working per day with no change, because nothing about
  them knows a series exists.
- **Bounded, not open-ended.** The organizer picks the weekdays (ISO 1–7), a
  time slot (start, optional end on the same day) and an `until` day at most
  `MAX_SERIES_DAYS` (183) after the first. `createEventSeries` writes all
  occurrences in **one batch** — all or nothing — which the cap keeps far under
  Firestore's 500 writes. `weeklyOccurrences` steps calendar days with
  `setDate`, so the wall-clock time survives a DST change.
- **`series` is immutable after create** (firestore.rules refuses a change), and
  optional on create, so installed binaries that never send it keep creating
  events.
- **Only the series' creator can add to it.** The first occurrence's `series.id`
  must be its own doc id; every later one must point at a root that exists once
  the batch lands (`getAfter`), with the same creator, village and visibility.
  Otherwise any member could slot an earlier-dated "occurrence" into someone
  else's series and replace its card in every collapsed list, or a later one
  that breaks the organizer's "este y los siguientes" batch. A batch at the cap
  (184 occurrences) stays inside the per-request document-access budget —
  pinned by a rules test.
- **One visibility per series.** The update rule refuses a visibility change on
  an occurrence, and the form hides the switch: "este y los siguientes" looks
  for siblings in the occurrence's own visibility partition.
- **Cancel one day or this-and-following.** Deleting an occurrence offers *Solo
  este día* (the existing soft-cancel) or *Este y los siguientes*
  (`cancelSeriesFrom`: the published occurrences from this start onwards).
  Editing an occurrence edits that day only; the screen says so.
- **The village hears about a series once.** `onEventPublished` broadcasts only
  `series.index === 0`.
- **Lists show one card per series**: `firstOfEachSeries` runs after
  `upcomingThenPast` (pueblo and org lists) and after the Explora filters (so
  a date filter still finds the matching day); the read site's `orderEvents`
  does the same. The card is the next occurrence, or the latest if all passed.
  Explora pages by occurrence docs but shows cards, so a daily series could
  fill its 50-row page alone: `grownFeedSize` doubles the page (up to 400)
  while it comes back full and shows fewer than 20 cards.
- **Shared cover.** The flyer is uploaded once, under the first occurrence, and
  every occurrence points at it. `cleanupRemovedEventImages` ignores series
  docs, so replacing the first day's cover cannot delete the image its siblings
  still show; the cost is a few orphaned files in Storage.

## Rejected alternatives

- **A rule doc expanded at read time** (virtual occurrences). Every feed query
  ranges on a stored `endBoundary`, registrations hang off a real event id, and
  share URLs name one — all of it would need a synthetic-id layer. Rejected as
  far more surface for the same product.
- **A rolling window topped up by a scheduled function.** Allows open-ended
  series, but adds a recurring job, a running cost and a second writer of
  events. The cap covers the observed need (a term, a season); revisit if
  organizers keep re-creating the same series every six months.
- **A separate `eventSeries/` collection.** Nothing reads the series as a whole
  except "cancel the following", which a `series.id` equality query answers;
  a collection would add rules, a converter and a sync problem for no reader.

## What this binds

- Any list that shows events as cards must run `firstOfEachSeries` (app) or
  `orderEvents` (read site) on an already-ordered list.
- A query over a series must pin `visibility` / `visibilityOrgId` like every
  `events` list (see `publicOnly` in eventService).
- `MAX_SERIES_DAYS` and the 184-day bound in `isValidEventSeries` move together.
  The last-day bound allows 26 h past `until` (the start of that day), because
  a Madrid day lasts 25 h when clocks go back.

## Revisit when

- Organizers need to edit the whole series at once (time, place, title) — add a
  "aplicar a los siguientes" path on edit, mirroring cancel.
- Series longer than six months are routinely re-created → consider the rolling
  window above.
