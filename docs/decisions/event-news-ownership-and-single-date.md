# Event/news ownership is a flat list of named users (control) + display-only orgs; events have one date

## Context

Events and news were single-owner: `createdBy` plus a nullable
`organizationId`/`authorOrgId`, and the update rule granted edit control to
*any member* of the owning org. Product wanted several people and several
organizations to co-organize a single event or news item. Events also carried a
confusing `endDate`, and `location` was a `{ type, coordinates, text }` union
that allowed free text instead of a real place.

The hard constraint that shaped ownership: **Firestore security rules cannot
iterate.** A rule can check membership of *one* org (`isOrgMember(orgId)` = one
`get()`), but not "is the caller a member of *any* of these N orgs" for an
arbitrary list. So a `organizerOrgIds: string[]` whose members get control is
not directly enforceable in rules.

## Decision

- **Ownership is two arrays on the document**, for both events and news:
  - `organizerUserIds: string[]` — named people. They get control **and** are
    shown.
  - `organizerOrgIds: string[]` — organizations. **Display-only**: shown by
    name, but membership grants no control.
  - `createdBy: string` stays as immutable audit; the creator is always forced
    into `organizerUserIds` at create time.
- **Control predicate, identical everywhere** (rules `update`/`delete`, the
  client's `useEntityCapabilities().canEdit`, and the walk-in authorization
  Cloud Function): `createdBy || request.auth.uid in organizerUserIds ||
  villageAdmin || appAdmin`. The `in`-operator form is expressible in rules with
  no triggers, no admin-callable, no denormalized controller list. The same
  predicate governs the other entity kinds (place, barrio, cartel), which simply
  have no organizer set — so `canEdit` is the one definition for all five.
- **Names are never denormalized.** Display resolves live via `useOwnerSummary`
  / `LiveOwnerChip` (`users/{id}.displayName`, `organizations/{id}.name`).
- **`createdBy` and `municipalityId` are immutable** on update.
- **Events have a single `startDate`.** "Ongoing" is derived, never stored: a
  published event whose start has passed and whose **Europe/Madrid** calendar
  day is not yet over (`isStartDayOver(start, now)`). The same helper is the
  single source of truth for `isEventOngoing` (mobile, device TZ) and the
  `completeExpiredEvents` Cloud Function (runs in UTC) — they must agree.
- **Location is `{ coordinates: LatLng, displayName: string }`**, required, with
  coordinates nested so an object with exactly `{lat,lng}` keys still serializes
  through the `{lat,lng}→GeoPoint` converter walker.
- Region (comunidad autónoma / provincia) is **not** stored on the item — it is
  derivable from the item's village/municipality.

## Rejected alternatives

- **Org membership grants control** (the prior behavior, kept for the multi-org
  case). Would require either a denormalized `controllerUids[]` kept fresh by a
  trigger that fans out on every org-membership change, or routing all
  event/news edits through admin-callable Cloud Functions. Both add real infra
  and staleness/latency for a village-scale app. We chose display-only orgs
  instead. **Cost accepted:** an org member can no longer edit an org's event
  just by being a member — they must be added as a named user.
- **Capped `organizerOrgIds` with unrolled per-index membership checks in
  rules.** Arbitrary cap, ugly rules, and `get()` is limited per rule
  evaluation.
- **`endDate` kept / fixed grace window for "over".** End-of-Madrid-day needs no
  organizer input and gives a natural "happening today" window; a fixed duration
  was arbitrary, and "over exactly at start" made events never show as "now".

## What this binds

- Any new write path for events/news (client or function) must enforce the
  control predicate above and must not reintroduce an org-membership control
  path.
- `organizerUserIds` / `organizerOrgIds` must stay arrays of plain strings
  (small, document-resident) so `array-contains` queries and the rule `in`
  operator keep working. "My events/news" and "an org's events" are
  `array-contains` queries backed by composite indexes.
- Date/"ongoing" logic must go through `isStartDayOver` — do not compute
  end-of-day inline in device-local or UTC time.
- Location consumers rely on the nested `coordinates` shape; do not flatten
  `{lat,lng}` into the `location` object or the GeoPoint walker breaks.

## Revisit when

- Multi-org co-hosting needs its members to actually manage the item (not just
  appear) → revisit the denormalized-`controllerUids`-via-trigger option.
- Cross-village regional feed filtering becomes a feature → denormalize
  `comunidadAutonoma`/`provincia` onto the item via the
  denormalized-read-model pattern.
- Multi-day/recurring events are needed → reintroduce an explicit end, but as a
  distinct concept from the single `startDate`. (Both happened: `endDate` came
  back for multi-day events, and weekly recurrence is one event per occurrence
  — see [weekly-event-series.md](weekly-event-series.md).)
