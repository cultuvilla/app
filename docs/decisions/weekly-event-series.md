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
  that breaks the organizer's "este y los siguientes" batch. The occurrence
  must also restate the root's `until` and `weekdays`, so the series cannot be
  stretched past the cap one hop at a time. Every occurrence in the batch reads
  the same root and member doc; the per-request access cap holds only because
  repeated reads of one path are cached — the emulator does not enforce that
  cap on batches, so a cap-length series must be tried against a real project
  before relying on it.
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

## Monthly series and yearly events (2026-11)

- **"Evento recurrente" offers Semanal / Mensual / Anual.** Weekly is unchanged.
- **Monthly is a series too**, `series.frequency: 'monthly'` (absent means
  weekly: binaries before it never send the field, and the `event-recurrence`
  backfill writes it on existing series). It repeats on the first day's day of
  the month, a missing day (the 31st in April) falling on the month's last,
  for at most `MAX_MONTHLY_SERIES_DAYS` (366) — 13 occurrences. It still
  stores its first day's weekday in `weekdays`, because older binaries'
  converters require one; they show it as a weekly series until they update.
  The rules apply the cap by frequency and make occurrences restate the
  root's frequency.
- **Yearly is not a series.** Next year's date of las fiestas is not known
  when they are created, so only this edition exists, flagged
  `repeatsYearly: true` (never together with `series`). Once it is over, its
  organizers get *Repetir el año que viene* on the detail screen: the create
  form prefilled from it (`copyFrom`), dates a year later and editable, last
  year's flyer reused. Rejected: creating next year's edition up front on the
  same date (usually the wrong day), and a scheduled job doing it (a running
  cost for what one tap does). `cleanupRemovedEventImages` leaves a yearly
  event's cover alone, since the next edition shows it.
- **A date that varies is one edition too** (decided 2026-11-01, user). Monthly
  and yearly events choose *Fecha: Fija* or *Distinta cada vez*. Fixed keeps the
  above. Varying stores `repeatDateVaries: true`, on a yearly edition or on one
  flagged `repeatsMonthly: true`, and only the next date is asked for: repeating
  it copies everything but the date. A fixed monthly stays a series, so
  `repeatsMonthly` always varies. Weekly has no such choice, since re-entering a
  date every week is more work than picking days. No reminder to repeat: it would
  be a scheduled job, a running cost, for now.
- **The group checklist.** When a group the creator belongs to organizes the
  event, the form's last option *Añadir lista de tareas* adds a Tareas step.
  The tasks are ordinary group tasks on the first occurrence (`eventId`). On a
  yearly event each asks for a month instead of a date: due by that month's
  end (`monthEndFrom`), recurring every year (`yearlyEventTask`), so the
  checklist comes back by itself. Assignees and shifts are set afterwards in
  the group's Tareas screen.

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
  The last-day bound allows 25 h past `until` (the start of that day), because
  a Madrid day lasts 25 h when clocks go back.

## Revisit when

- Organizers need to edit the whole series at once (time, place, title) — add a
  "aplicar a los siguientes" path on edit, mirroring cancel.
- Series longer than six months are routinely re-created → consider the rolling
  window above.
