# Organization event history

**Priority:** medium — an organization's page says nothing about what it does
**Gate:** none
**Next:** decide whether a backfilled past event is an `event` with `status: 'completed'` or a separate lightweight entity

## The idea

An organization's detail screen (`[pueblo]/entidad/[entidad]`) should list **the events
it has organized** — upcoming first, then a past section going back as far as the
organization has records. Today it shows none: the page has a description, images and
members, and nothing about what the organization actually *does*.

For a peña or an asociación, that list is the organization's identity. A cultural
association in a small village is "the one that does the matanza in December, the summer
meal, and a trip every June". Its members join because of that record, and a newcomer
understands it only through it.

## What already exists

- Events carry `organizerOrgIds`, and `getEventsByOrganization()` in
  `packages/shared/src/services/eventService.ts` already queries by it, with the
  private/public split handled. **No screen calls it any more** (its docstring still
  says "the org detail screen's event list"), so half of this is already built and
  orphaned.
- `EventStatus` includes `completed`.
- Carteles (`festivalPoster`) already model an image with a year-level date — the right
  shape for the poster or letter of a past activity.
- The village `historia` (`HistoryEntry`) has `HistoricalDate` with year/month/day
  precision, which is how old events are actually known.

## The part that is new: backfilling the past

The motivating case is Matabuena's cultural association (La Anduela). It has run
activities for ~25 years, and its private archive holds the invitation letter for
~15 of them from 2022–2026, plus names and years for ~10 more. None of it can be
entered today in a way that shows up as *this organization's history*.

Open questions:

- **Past dates.** Can an organizer create an event whose `startDate` is in the past?
  Rules only require a timestamp, but the create form, notifications and the "upcoming"
  feeds all assume the future. A backfilled event must never notify anyone or appear
  in *Próximos*.
- **Precision.** Many old activities are known only by year ("excursión a Asturias,
  2022"). `Timestamp` forces a day. Reuse `HistoricalDate`'s precision instead of
  inventing a day nobody recorded.
- **Registrations.** A past event has no sign-ups, and none should be imported: past
  attendance is personal data held by the organization, and a person reaches the app by
  signing up themselves.
- **One entity or two.** A completed `event` keeps one list and one URL per activity.
  A dedicated "past activity" entity avoids polluting event feeds and counters (e.g.
  `village-fiestas-wrapped` counts events per window). Leaning towards `event` +
  `completed` + a `backfilled: true` flag that every feed and counter excludes.

## Why it is worth it beyond one association

Every organization in every village has the same gap. The pueblo's own `historia`
records *what happened*, but not *who made it happen*. A per-organization activity list
gives peñas and asociaciones a reason to maintain their page that WhatsApp cannot match:
a durable, public record of what they have done.
