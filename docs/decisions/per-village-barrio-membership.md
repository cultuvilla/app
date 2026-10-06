# Per-village barrio & the member-vs-resident split

A user can belong to multiple villages and set a distinct barrio in each. The
non-obvious part is *where* barrio lives and why membership and residence are two
different things — neither is inferable from reading a single service.

## Problem

Barrio residency has to satisfy two facts:

1. **The residents-by-barrio list must query one collection.** It is a single
   `array-contains` query — `getPersonsByBarrio` →
   `where('municipalityLinks', 'array-contains', { municipalityId, barrioId })`
   over **`persons`**. That collection is the only place where *all* residents
   coexist: account-holders **and** non-account persons (deceased relatives,
   historical figures, family members someone else added). Non-account persons
   have no membership doc, so the query cannot read the members subcollection.
   `persons.municipalityLinks` is therefore the non-negotiable read/query surface.

2. **Barrio is tied to the membership lifecycle for account-holders.** Joining a
   village makes you a resident; leaving drops you. But that coupling does not
   require a *second copy* of the value — it only requires the residence link to
   be written and removed alongside the membership.

## Decision

Two entities, two roles — **member ≠ resident**:

| | Lives on | Who qualifies |
|---|---|---|
| **Member** | `members/{uid}` (keyed by Firebase uid) | Account-holders only — a non-account person has no uid, so cannot have a membership doc |
| **Resident** | a `persons.municipalityLinks` entry | Anyone with a residence link — account or not |

So a deceased great-grandparent is a **resident** of a barrio (appears in
`getPersonsByBarrio`) but never a **member** (no role, no admin, absent from
member counts). "Residents of barrio X" is a broader set than "members living in
barrio X".

**Residence barrio is single-source-of-truth on `persons.municipalityLinks`** —
for everyone, account or not. There is no `member.barrioId`. Writes:

- **Owner (client), directly on the person doc** — the `persons` update rule
  allows `userId == request.auth.uid`:
  - **Join** (`joinVillage`) is an atomic `writeBatch` that creates the member doc
    AND upserts the residence link — no eventual-consistency window.
  - **Change barrio** (`personService.updateResidenceBarrio`, used by the
    own-profile `MembershipVillageEditor` — which also handles village
    add/leave) and **non-account persons** (`ResidenceLinksEditor`) write the
    person doc directly.
- **Server-privileged paths** cannot write another user's person doc client-side,
  so they use the admin SDK:
  - **Admin removes a member** → the `syncMemberBarrioToResidence` trigger
    (`onDocumentDeleted`, delete-only) removes the ex-member's residence link.
  - **Server-side member creation** (`startVillage`,
    `respondToOrganizerRequest`) projects the whole-village residence link in the
    same transaction, via the shared `functions/src/village/residenceProjection.ts`
    helper.

Every residence-link write — client or server — constructs the entry through
`buildResidenceLinks`, the single constructor of the exact
`{ municipalityId, barrioId }` shape the `array-contains` query matches on. A
stray extra key or wrong `null` would silently drop the person from the list.

## Key points

- **No duplicate field, no projection lag.** Barrio lives in exactly one place.
  The earlier design stored `member.barrioId` and had a trigger project it into
  the person; that duplication and its eventual-consistency edit path are gone.
- **The delete trigger is the load-bearing server remainder.** When a village
  admin removes a member, the ex-member's `persons.municipalityLinks` must be
  cleaned, and the admin **cannot** write another user's person doc — only an
  admin-SDK context can. (Self-leave also fires it, harmlessly: the client batch
  already removed the link, so the idempotency guard skips.)
- **Residence writes are unvalidated, by design.** The barrio picker only offers
  *approved* barrios, so the honest path is fine; a malicious client could write a
  bad/foreign link, but the blast radius is cosmetic pollution of one residents
  list. This matches the always-unvalidated non-account path — equalizing, not
  newly weakening.
- **Rules cannot validate residence.** `municipalityLinks` is an arbitrary-length
  **array**; rules cannot iterate it doing a `get()` per element. Cross-doc
  validation can only live in a callable, never in rules.
- **On the own-profile editor, adding a village *is* joining and removing *is*
  leaving.** `MembershipVillageEditor` performs the membership mutations directly:
  add → `ensureVillageMembership` (dormant-safe), leave → `leaveVillage` (the
  atomic self-leave batch). A joined row's village is **fixed** (barrio-only; leave
  and re-add to change it) so there is no "swap village = leave-old + join-new"
  path. Leaving the village that is currently `activeMunicipalityId` reassigns it
  to the first remaining membership (by name), or `null` when none remain — nothing
  else resets the active pointer on leave.

## Revisit when

If the censo ever needs to be trustworthy *by construction* (fake residents
become a real problem), route residence writes through **one shared validating
callable used by both account and non-account paths** — it checks the barrio is
approved (and, if wanted, that the writer belongs to the village) before writing
the person doc. Do **not** re-introduce per-path validation or a projection
trigger: that only brings back the asymmetry and the duplication this design
removed.
