# Delete lives in the edit screen, never the detail header

Every entity's removal affordance is a `trash` icon in its **edit-screen**
`ScreenHeader` `rightSlot`, gated to who can manage it, behind a confirm dialog —
never in the entity **detail** header.

## Problem

The delete UX was inconsistent: the event had a `trash` action in its *detail*
header (that actually soft-cancelled), news had no delete anywhere, and
place/barrio/org/festival-poster were deletable only from the village-management
manager lists. There was no single, predictable place a user (or an agent) could
look for "remove this".

## Decision

Delete is a header icon on each entity's **edit** screen, shown only to a manager,
always behind a confirm (`DeleteHeaderButton`, which branches to `window.confirm`
on web since `Alert.alert` is a no-op there). It is removed from — and never added
to — the detail header. Every edit surface already renders `ScreenHeader` with a
`rightSlot`, so no header-layout change was needed.

What the action *does* is per-entity, but the *location* is uniform:

- **event** — soft cancel (`updateEventStatus → 'cancelled'`, registrations preserved).
- **news** — hard delete via the cascading `deleteNewsPost` callable (authorized for
  the author, not just admins).
- **barrio / place / festival-poster** — reversible **soft-hide** via
  `setContentVisibility`, framed as "Eliminar" (see
  [content-moderation-optimistic-visibility](content-moderation-optimistic-visibility.md)).
- **organization** — hard delete (`deleteOrganization`).

## What this binds

- New entity edit screens put removal in the `ScreenHeader` `rightSlot` via
  `DeleteHeaderButton`, gated by the shared content policy — `can('delete', kind, doc)`
  from `useEntityCapabilities` (or `can('delete')` from `useOrgCapabilities`), which
  `contentPolicyParity.test.ts` holds to the rules. Do not add a
  delete/remove action to a detail (`EntityDetailHeader`) screen.
- The per-entity *semantics* (soft-cancel / hard-delete / soft-hide) follow the
  entity's own model; only the placement is a fixed convention.

## Revisit when

A new entity genuinely has no edit screen but still needs removal — then decide a
placement rather than defaulting to the detail header.
