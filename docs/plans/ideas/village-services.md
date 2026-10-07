# Servicios — Idea Exploration

**Priority:** low

> Pre-spec exploration, derived from a design conversation on
> 2026-08-19. Not yet a formal design — the open questions at the bottom must be
> answered before this becomes a plan in `ready/`.

---

## What we're building

A village can publish **servicios** — bookable community facilities like a padel
court or a gym. Each servicio has its own admins, its own availability, and a
booking flow that lets residents claim a time slot or check out a shared item
(the classic example: taking the gym key).

Two real examples drove the design and bound its scope:

- **Pádel** — a court reserved in fixed time slots.
- **Llave del gimnasio** — a single key held by one person at a time, returned
  when they're done.

A third mechanic (free-form "propose a time, admin approves") was explored and
**deliberately dropped** — it was the only unstructured surface in the design,
it defeats conflict detection, and neither motivating example needs it.

---

## Entity shape

`services/` is a **first-class top-level collection scoped by `municipalityId`**,
per invariant 3 in AGENTS.md. It is a full **entity** in the AGENTS.md sense: it
renders as a card in a horizontal `Section` on the village home and opens a
hero-image detail screen via `EntityDetailScaffold`. That means a new
`EntityKind` in [registry.ts](../../../apps/mobile/lib/entities/registry.ts)
with its own fallback icon.

A servicio is **standalone** — it carries its own name, image and address rather
than pointing at a `place`.

> **Dissent recorded:** an optional `placeId` would cost one nullable field and
> buy the map pin, the address, and immunity from "Pádel Municipal" existing as
> two docs that drift apart. The decision was standalone; noting the trade-off
> so the next reader doesn't re-litigate it blind.

### Creation and approval

Any village member may create a servicio; it lands as `status: 'pending'` and a
**village admin approves it**. This is the `organizations` flow reused wholesale:

- pending doc written by the client,
- an entry in the Solicitudes **Recibidas** inbox for village admins,
- an `approveService` callable (rejection can stay a client write, mirroring
  `rejectOrganization`).

### Admins

`services/{serviceId}/members/{uid}` with `role: 'admin' | 'member'`, following
the membership-group abstraction villages and orgs already share. `role` is
**function-owned**; new admins are created and demoted only through an audited
callable that mutates the role and appends to `membershipEvents/` in one
transaction. This is the third instance of a pattern that already exists twice —
the callable should be named and shaped like `changeOrgMemberRole`.

Authority is always the role flag. The creator is seeded as admin on approval
(as `requestedBy` is for orgs), and that pointer grants nothing on its own.

---

## Two modes, one reservation model

The insight that keeps this shippable: slot booking and key checkout are **not
two subsystems**. They are one reservation with two ways of deciding
`start`/`end`.

| Mode | start / end | Approval | Capacity |
|---|---|---|---|
| `slots` (pádel) | from the published weekly grid | configurable | 1 per slot |
| `checkout` (llave) | start = now, end = when returned | configurable | 1 total, exclusive |

`serviceReservations/` is top-level and `municipalityId`-scoped. A reservation
belongs to a **uid**, not a `person` — unlike event registrations. This is
deliberate: a real accountable adult must own a key checkout, and there is no
family-member case for booking a court.

### Availability is computed, never stored

A `slots` servicio holds **one availability config** — weekly opening hours plus
a slot length ("Mon–Sun 09:00–22:00, 90-minute slots"). The grid is derived
client-side from that config. Only *reservations* are documents.

Consequences worth stating plainly:

- No scheduled function generating next week's slots.
- No slot documents to backfill, migrate, or clean up.
- The admin configures once instead of opening slots by hand every week —
  which matters, because the admin is a volunteer.

### Deterministic IDs give conflict prevention for free

A `slots` reservation's document ID is derived: `${serviceId}__${startISO}`.
Two neighbours tapping the same 19:00 slot at the same instant resolve by
`create()` failing for the loser — no transaction, no read-modify-write race,
and Firestore rules can enforce the shape. **This is the load-bearing decision;
most of the rest of the design bends around it.**

### Closing a checkout

Either the holder marks it returned, or an admin force-closes a forgotten one.
Trust-based with an escape hatch, which matches how a village actually behaves.

---

## Per-service configuration

All optional, all with defaults, all living on the service doc:

| Knob | Purpose |
|---|---|
| `requiresApproval` | Auto-confirm a free slot, or route every booking to the service admin |
| `access` | Open · village members · members of a given org |
| `maxActiveReservations` | Stops one neighbour holding five upcoming slots |
| `bookingHorizonDays` | Stops one neighbour claiming the whole month at midnight |
| `cancellationWindowHours` | Free cancel until N hours before |
| `blackouts` | Blocked dates or individual slots (fiesta, flooded court) |

**Money is out of v1**, but the config shape should not preclude adding a fee
later. **Access defaults to open** — noting that "open" still means *signed in*;
you cannot hold an anonymous visitor to returning a key.

Blocking a date must cancel the reservations that fall inside it and notify
their owners — a blackout that silently strands bookings is worse than no
blackout.

---

## Surfaces

- **Section on the village home** — service cards alongside events, places, news.
- **Service detail screen** — hero image, description, and the booking grid (or
  the checkout state).
- **"Mis reservas"** — upcoming bookings and active checkouts, and the only
  reliable place to cancel or press "Devolver". Initially cut from scope, then
  restored: without it, a user who booked Thursday's court has nowhere to go,
  and a key holder has nothing to press.
- **Per-service admin panel** — today's bookings, who currently holds the key,
  force-close, block a date.

---

## Notifications

- **Slot reminder** before your booking ("Tu pista de pádel es en 1 hora") —
  scheduled function, not a trigger.
- **Admin cancelled your booking** — trigger-based, and rude to omit given
  blackouts exist.

> **Gap flagged, not yet accepted:** the **overdue-checkout nudge** ("llevas la
> llave desde ayer") was dropped. Nothing else in the design ever notices that
> someone has held the gym key for four days — it is the only defence against a
> key quietly vanishing, and it reuses the same scheduled function the slot
> reminder already requires. Recommend reinstating.

---

## Open questions

These block promotion to `ready/`.

1. **Can a slot hold more than one person?** A padel court seats four. Is that
   one reservation owned by one uid, or four reservations against a slot with
   `capacity: 4`? This changes the deterministic-ID scheme — `${serviceId}__${startISO}`
   is unique per *slot*, so a shared slot needs the uid in the ID and a separate
   count check, which reintroduces the race the current design avoids. It also
   changes whether "capacity per window" (a gym admitting 10 people 18:00–20:00)
   falls out for free or needs its own mode.

2. **Does `checkout` need a waitlist?** When the key is out, the next person sees
   only "no disponible". Options: nothing (they ask in the village WhatsApp,
   which is what happens today), a "notify me when free" subscription, or a real
   FIFO queue. A queue implies claim windows and expiry, which is a meaningful
   chunk of work — worth deciding before the model is fixed rather than after.

3. **Does an approval-required booking belong in Solicitudes?** Service creation
   clearly does. Per-booking approval is higher volume and shorter-lived; it may
   deserve the service admin panel instead of the shared inbox.

4. **What is the smallest useful v1?** `slots` alone would ship pádel and defer
   every checkout-specific mechanic (return, force-close, overdue). Worth pricing
   before committing to both modes at once.

---

## Prior art in this repo

- `organizations` — pending → approved creation flow, members subcollection with
  function-owned roles, audited role changes via `membershipEvents/`.
- `events` + `registrations` — capacity, sign-up, and the per-registration
  private data pattern from [event-signup-fields](../../decisions/event-signup-fields.md).
- `municipalities/{id}/members` — the other instance of the membership-group
  abstraction a servicio's admins would make a third.
