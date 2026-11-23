# La Anduela's past activities: a one-off backfill

**Priority:** low — the org page already lists events created in the app; this only adds La Anduela's history
**Gate:** blocked:Álvaro runs the backfill himself, as a one-off for La Anduela
**Next:** write a one-off script that enters La Anduela's past activities (the ~15 invitation letters from 2022–2026, plus ~10 known by name and year) as that organization's events

## Decided 2026-10-17 (Álvaro)

**Not an app feature.** Organizations get no way to enter past events. Álvaro backfills
La Anduela's archive once, by hand or by script, for this one case. If another
organization ever asks, that's a new plan.

## Context

The org detail screen (`[pueblo]/entidad/[entidad]`) already lists the events whose
`organizerOrgIds` include the org (`watchEventsByOrganization`): upcoming first, then
past, with private ones shown to vetted members only. The read site's org page lists
the public ones. What's missing is everything La Anduela did before it joined the app:
about 25 years of activities.

## What the backfill must respect

- **Nobody is notified.** A past event must never send a notification or appear in
  *Próximos*. Write it with a past `startDate` and `status: 'completed'`, straight from
  the script, not through the create flow.
- **Counters.** `village-fiestas-wrapped` counts events per window. Check whether
  backfilled events would skew a published window before writing them.
- **No registrations.** Past attendance is personal data the association holds. None
  is imported.
- **Dates known only by year** ("excursión a Asturias, 2022"): `Timestamp` forces a
  day. Pick a convention, e.g. 1 January or mid-year, and say in the event that only
  the year is known.
