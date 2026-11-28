# Open feed architecture — events and organizations are top-level

## Context

The original design (`cultuvilla-design`) treated each village as a tenant and
nested events and organizations under `villages/{villageId}/`. The product
direction shifted: events are global content discovered through a single
chronological feed across all villages, and a village is a *facet* of an event
(where it happens, who hosts) rather than its container. Membership stays
meaningful but no longer gates participation.

## Decision

- `events/{eventId}` and `organizations/{orgId}` live at the **top level**, each
  carrying a `municipalityId` field. Registrations stay nested under events
  (`events/{eventId}/registrations/{regId}`); village members and org members
  stay nested under their municipality / org (intrinsic per-pair relationships).
- Event docs carry **denormalized municipality display fields**
  (`municipalityName`, `municipalityCoverImage`, `municipalityCoordinates`) kept
  in sync by a Cloud Function trigger on `municipalities/{id}` writes. This is the
  canonical example in
  [denormalized-read-models.md](../architecture/denormalized-read-models.md);
  the trigger is [syncVillageDenormalization.ts](../../functions/src/syncVillageDenormalization.ts).
- The home feed is a pure chronological query
  (`events where status==published and startDate>=now orderBy startDate`).
  "Cerca de mí" is a **client-side haversine filter**, not a server-side
  proximity rank.
- `activeMunicipalityId` on the user doc is demoted to a **UI hint** (feed
  centering, default village when creating events, censo nudge target) — never a
  routing or security primitive.

## Rejected alternatives

- **Keeping events/orgs nested under villages.** Cascade-delete (unused) and
  path-based rule access to `villageId` (replaceable with one field read) did
  not justify the cross-village query cost, the collection-group indexing
  burden, and locking out future multi-village orgs.
- **Geohash / server-side proximity ranking.** Overkill at current scale — the
  feed returns ~20 events per page; a haversine call per card is trivial.
- **Backwards-compatible URLs** for old nested routes. No external links exist;
  clean break was cheaper.

## What this binds

- New event/org queries are single-collection; add composite indexes
  (`status asc, startDate asc` and `municipalityId asc, startDate asc`) in the
  same change as a new query shape.
- Any code reading `activeMunicipalityId` must tolerate `null` (zero-membership
  users) and must not use it for access control.
- Adding a municipality display field to feed cards means extending the
  denormalization trigger, not an N+1 read in the feed.

## Revisit when

- Multi-village organizations: done as `municipalityIds[]` on the group, with
  no `parentOrgId` — see [multi-village-groups.md](multi-village-groups.md).
- The chronological + geo feed gets too noisy → reconsider follows/following or
  feed ranking (explicit non-goals today).
