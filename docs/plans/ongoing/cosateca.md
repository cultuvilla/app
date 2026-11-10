# Cosateca — what a group's people lend, offer and give to each other

**Priority:** high
**Landed:** none
**Gate:** none
**Next:** Phase 1 — the data layer (models, rules, service, `respondToCosaRequest`, notifications, the group setting and its backfill)

Decided 2026-11-10 (user): build the cosateca as a group tool, taking the agent's picks
with three changes: *regalos* are in from the start; a group's admin chooses whether its
cosateca is for its integrantes or for the whole pueblo (the ayuntamiento's, where anyone
in the village may borrow the things, is the motivating case); and it is the moment to
unify it with the *Servicios* idea (the pádel court, the gym key), which this plan absorbs.

## Why

Village groups already lend things — the asociación's carpa and paellera, a neighbour's
taladro, the ayuntamiento's key to the gym — and arrange it on WhatsApp and by memory.
Nobody knows what exists, who has it now, or when it is due back. The cosateca puts the
catalogue, the request and the loan in the app, next to the group's other tools.

**Success:** La Anduela lends its fiestas kit through the app for one summer, and one
ayuntamiento lends one thing (a key, a set of tables) to the whole pueblo through it.

**Anti-goals:**
- **No money.** No deposits, prices or fines: Cultuvilla never moves money (group-toolkit
  anti-goal). `conditions` is free text ("devolver limpia").
- **No leaked contact data.** Integrantes never see each other's phone or email. The
  handover is arranged inside the request (Phase 2's chat).
- **Not Wallapop.** Only a group's integrantes offer; nothing is public to the anonymous
  web; nothing is sold.

## Decisions

1. **Owned by a group, offered by its integrantes.** A cosa belongs to a group's
   cosateca. Its owner is either an integrante (`ownerUid`) or the group itself
   (`ownerUid: null`, managed by the group's admins: the carpa, the gym key).
2. **Three kinds:** `prestamo` (lent and returned), `servicio` (a favour, nothing comes
   back), `regalo` (given for good). Phase 3 adds `reserva` (time slots).
3. **The audience is the group's setting:** `organizations.cosateca = { enabled, audience }`,
   `audience: 'integrantes' | 'pueblo'`. Off by default, for every group type. `pueblo`
   means every signed-in member of the village may see and ask — never the anonymous web,
   so there is no read-site page.
4. **The request lifecycle** (one doc per request, every transition through the
   `respondToCosaRequest` callable except the creation):

   | kind | path |
   |---|---|
   | prestamo | `pending` → `accepted` \| `declined` → `lent` → `returned` |
   | servicio | `pending` → `accepted` \| `declined` → `done` |
   | regalo | `pending` → `accepted` \| `declined` → `given` |

   The requester may `cancel` until it is lent/done/given. Dates (`fromOn`/`untilOn`,
   Madrid day keys) are optional. Accepting a prestamo whose dates overlap another
   accepted or lent request of the same cosa is refused. Lending sets the cosa's
   function-owned `heldBy`; returning clears it. Giving a regalo closes the cosa
   (`status: 'given'`) and declines its other open requests.
5. **The manager answers.** Owner for a personal cosa; any admin of the group for a group
   cosa. The group's admins may also read every request of their group and close one
   (a forgotten return), as the backstop.
6. **Notifications reuse `group_task`** with a new `cosaRequestId` field (defaulted null).
   A new enum value would throw in installed binaries' strict notification converter; an
   old binary opens the group's Tareas instead, which is harmless. Category `mine`.
   New requests also show in the Buzón's *Necesita tu acción*; sent ones while pending.
7. **Categories are a fixed list:** herramientas, cocina, fiestas, deporte, niños, jardín,
   libros, otros. One optional photo.
8. **Servicios is absorbed.** The gym key is a group `prestamo` with audience `pueblo`,
   which Phases 1–2 already give. The pádel court is Phase 3's `reserva`. There is no
   separate `services/` collection and no third membership group: the owning group's
   admins are the facility's admins.

## Data

Top-level, scoped by `municipalityId` (invariant 3): a `pueblo` cosateca is read across
groups, and a user's requests across villages, which subcollections would make
collection-group queries.

- `cosas/{cosaId}` — `municipalityId`, `orgId`, `audience` (denormalized from the org:
  `pueblo` only while the cosateca is enabled with that audience, else `integrantes`;
  kept by `syncCosaAudience`), `ownerUid` (null = the group's), `ownerName`, `kind`,
  `title`, `description`, `category`, `imageURL`, `conditions`, `status`
  (`available` | `paused` | `given`), `heldBy` (function-owned:
  `{ requestId, uid, name, untilOn } | null`), `createdBy`, `createdAt`, `updatedAt`.
- `cosaRequests/{requestId}` — `municipalityId`, `orgId`, `cosaId`, `cosaTitle`,
  `cosaKind`, `ownerUid` (copied from the cosa, so the owner's query needs no join),
  `requesterUid`, `requesterName`, `message`, `fromOn`, `untilOn`, `status`, `createdAt`,
  `respondedAt`, `closedAt`, `overdueNotifiedOn`. Status and timestamps function-owned.
- Phase 2: `cosaRequests/{requestId}/chat/{msgId}`.

## Phase 1 — data layer

Models + converters + refs, `cosatecaService` (`watch*` for a group's cosas, the
village's `pueblo` cosas, my requests, requests to me / my group), rules + rules tests,
indexes, `respondToCosaRequest` (transaction), `onCosaRequestWritten` (notifications),
`syncCosaAudience`, `organizations.cosateca` + `scripts/backfill-org-cosateca.mjs`
(pre-deploy, autoApply), services map, conformance check, account deletion.

## Phase 2 — screens

- **Group:** a `cosateca` section (member list, when enabled): the catalogue by
  category, "Ofrecer algo", my requests and the requests to me. The switch and the
  audience in the group's Ajustes.
- **Cosa detail** and **request detail** (actions by role, the state, the dates).
- **Village:** "Cosateca del pueblo" — every `pueblo` cosa of the village, from the
  village home; asking from there works for any village member.
- **Buzón:** incoming requests in *Necesita tu acción*; sent ones while pending.

## Phase 3 — the handover and the overdue nudge

- A chat inside each request (requester, manager, the group's admins), on the group
  chat's components.
- `sendCosaReminders` (daily 10:00 Madrid, with the task reminders' pattern): the day
  after `untilOn`, "llevas la carpa desde el día 3" to the holder, once
  (`overdueNotifiedOn`).

## Phase 4 — reservas (the pádel court)

From the *Servicios* exploration (2026-08-19), with its open questions settled by the
agent's picks:
- A `reserva` cosa carries one availability config (weekly hours + slot length); the
  grid is computed, never stored.
- A booking is a `cosaRequests` doc with a deterministic id `${cosaId}__${startISO}`,
  so two taps on the same slot resolve by the loser's create failing.
- One booker per slot (four players = one booking). No waiting list. `requiresApproval`
  per cosa, default off (a free slot confirms itself).
- Knobs: `maxActiveReservations`, `bookingHorizonDays`, `blackouts` (cancelling and
  telling the bookings inside one), a reminder an hour before.

## Left for later

- What happens to an integrante's cosas when they leave the group (today: they stay,
  managed by the owner; the group's admins can delete them).
- More than one photo; a waiting list on a lent cosa ("avísame cuando vuelva").
