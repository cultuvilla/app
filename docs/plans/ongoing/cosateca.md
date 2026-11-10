# Cosateca — what a group's people lend, offer and give to each other

**Priority:** high
**Landed:** none
**Gate:** none
**Next:** promote with the next release (all four phases are on develop)

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

### Phase 1 — as built

- Models in `packages/shared/src/models/organization/`: `CosaDataModel.ts` (with
  `CosatecaSettingsSchema`, `effectiveCosaAudience`), `CosaRequestDataModel.ts`, and
  `cosatecaLogic.ts` — the transition table (`nextCosaRequestStatus`,
  `availableCosaRequestActions` for the screens), `cosaDatesOverlap` (undated means
  open-ended: one undated loan at a time), `isCosaRequestOverdue` for Phase 3.
- `cosatecaService`: `watchGroupCosas`, `watchVillageCosas`, `watchCosa`, `createCosa`,
  `updateCosa`, `deleteCosa`, `requestCosa`, `watchCosaRequest`, `watchMyCosaRequests`,
  `watchCosaRequestsToMe`, `watchGroupCosaRequests`, `respondToCosaRequest`.
- The group's admins count as managers of every cosa of the group, for every move (not
  only closing one): simpler, and they are the backstop anyway.
- `syncCosaAudience` is folded into `onOrganizationUpdated`, not a new trigger.
- The names are checked by the rules: `ownerName` / `requesterName` must be the
  `publicProfiles` name (the group's name for a group cosa).
- Notifications: `group_task` with `cosaRequestId`, routed to
  `groupCosaRequestPath` (`/grupos/<orgId>/prestamo/<requestId>`); `groupCosaPath`
  (`/grupos/<orgId>/cosa/<cosaId>`) exists for the cosa screen. Sent: a new request and
  a cancellation to the managers (never to the requester themself), accepted / declined
  / given to the requester. Lent, returned and done tell nobody. **Both routes have no
  screen until Phase 2**, so a tap on dev opens an unmatched route meanwhile.
- `deleteAccount` deletes the user's cosas and every request by or to them, and clears
  `heldBy` on a group's cosa they hold.
- Review fixes (2026-11-10): `kind` is frozen once offered; whoever asked never answers their own request (an admin asking goes to another manager); giving a regalo never declines a lent request; asking needs the group approved with its cosateca on; a failed audience sync no longer blocks the org's approval notice.
- Not done: `cosateca` is not yet a `GROUP_SECTIONS` entry (Phase 2 adds it with the
  screen); a deleted cosa leaves its requests (they can still be declined or cancelled).

## Phase 2 — screens

- **Group:** a `cosateca` section (member list, when enabled): the catalogue by
  category, "Ofrecer algo", my requests and the requests to me. The switch and the
  audience in the group's Ajustes.
- **Cosa detail** and **request detail** (actions by role, the state, the dates).
- **Village:** "Cosateca del pueblo" — every `pueblo` cosa of the village, from the
  village home; asking from there works for any village member.
- **Buzón:** incoming requests in *Necesita tu acción*; sent ones while pending.

### Phase 2 — as built

- **Routes:** the `cosateca` group section (`/grupos/<orgId>/cosateca`, listed for
  integrantes only while `org.cosateca.enabled`), `/grupos/<orgId>/cosa/<cosaId>` and
  `/grupos/<orgId>/prestamo/<requestId>` (neither requires membership: a villager of a
  `pueblo` cosateca opens both, the rules decide), and `/<pueblo>/cosateca` (a member
  `VILLAGE_SECTIONS` entry, so the read site answers it with the app hand-off — no
  web page).
- **Section** (`components/feature/groups/cosateca/GroupCosateca.tsx`): Catálogo (category
  chips over the categories in use; given regalos drop out) · Lo que pedí · Me piden
  (requests for my cosas in this group, plus the group's own for an admin). "Ofrecer
  algo" opens `CosaSheet`: kind, name, category, description, conditions, one photo,
  and for an admin "Mío / Del grupo".
- **Photos** live at `cosas/{cosaId}/image/` (`uploadCosaImage`, a storage rule like the
  org's), so a new cosa is created first and then given its photo;
  `cleanupRemovedCosaImages` deletes one no edit references any more.
- **Cosa screen:** Pedirlo (`AskCosaSheet`: optional dates, none for a regalo, and a
  message), "Ver mi solicitud" while mine is open, and for its manager edit, pause /
  resume, remove and its requests. **Request screen:** state, dates, message and exactly
  the moves `availableCosaRequestActions(kind, status, cosaRequestRoles(…))` allows; a
  refused move shows the callable's own reason.
- **Village home:** `VillageCosatecaEntry`, a pill shown to members only while some
  `pueblo` cosateca has something in it.
- **Buzón:** `watchCosaRequestsToAnswer` (pending requests for my cosas and for the
  group's own cosas of every group I administer, from `useMyGroups`) under *Necesita tu
  acción*, for anyone, approver or not; my pending ones are `pending-sent` rows of type
  `cosa`.

## Phase 3 — the handover and the overdue nudge

- A chat inside each request (requester, manager, the group's admins), on the group
  chat's components.
- `sendCosaReminders` (daily 10:00 Madrid, with the task reminders' pattern): the day
  after `untilOn`, "llevas la carpa desde el día 3" to the holder, once
  (`overdueNotifiedOn`).

### Phase 3 — as built

- **Chat:** `cosaRequests/{requestId}/chat/{chatId}`, group chat messages
  (`GroupChatMessageDataSchema`, the same create rule). Read and written by the request's
  parties — requester, `ownerUid`, the group's admins; deleted by its author and the
  group's, village's and app's admins (the last two from a report, since they cannot read
  it). `CosaRequestChat` under the request screen: oldest on top, blocked authors hidden,
  report and delete per message. A report names `cosaRequests/{id}/chat/{chatId}` and the
  village's Denuncias delete it. No unread badge and no opt-in: a request has two sides,
  so every message pushes the other side (`onCosaRequestChatCreated`, `group_task` with
  `cosaRequestId`, keyed on the message). A group's admins read a personal cosa's chat as
  the backstop but are not pushed it. `deleteAccount` deletes the chat of every request it
  deletes (the user's own messages already go with every `chat` collection group).
- **The chat closes** (decided 2026-11-10, user): 14 days after the request ended
  (`closedAt`, else `respondedAt`, else `createdAt`) it takes no new messages; what was
  written stays readable. `COSA_CHAT_CLOSE_DAYS` / `isCosaChatOpen` in cosatecaLogic.ts,
  the same 14 days in the chat's create rule, and the screen swaps the composer for a hint.
- **Overdue nudge:** `sendCosaReminders`, daily 10:00 Madrid. A `lent` request whose
  `untilOn` has passed (not only yesterday's, so a missed run still catches it) is stamped
  `overdueNotifiedOn` in a transaction, then the holder ("Toca devolver") and the managers
  ("No ha vuelto") are told once, `cosa_<requestId>_overdue`. Index
  `status + overdueNotifiedOn + untilOn`.
- **Review fix folded in:** the cosa and request screens take the viewer's admin rights
  from the cosa's/request's `orgId`, not the URL's group; the Buzón reports an unreadable
  pending-request list through `captureError` instead of dropping it silently.

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

### Phase 4 — as built

- **Model:** kind `reserva`; `cosas.reserva` (`ReservaConfigSchema`, null on every other
  kind): `hours` as a fixed map of ISO weekdays `'1'`–`'7'` (one opening range each, null
  = closed — a map, not a list, so the rules check every entry), `slotMinutes` 15–240,
  `requiresApproval`, `maxActiveReservations` 1–20, `bookingHorizonDays` 1–90 (today is
  day 0), `blackouts`. The grid is `reservaDaySlots` (reservaLogic.ts, Madrid wall time
  through `madridInstant`), shared by the callable and the screen. A booking is a
  `cosaRequests` doc with `startAt`/`endAt` (null on every other kind) and its day as both
  `fromOn` and `untilOn`; the transition table gives a reserva only accept / decline /
  cancel, and nothing moves once its slot has started. The kind is new on a collection no
  store build has ever read (the cosateca never left dev), so the strict enum breaks
  nothing installed.
- **Deviation — the deterministic id is the slot's lock, not the booking's:**
  `cosas/{cosaId}/slots/{startISO}`, claimed in `bookReservaSlot`'s transaction. A
  booking doc keyed by its slot would be reused once a booking is cancelled, carrying its
  predecessor's chat and colliding on its fixed notification ids; and the lock is what
  lets every viewer see which slots are taken, which a private booking cannot. It names
  no one. All booking goes through the callable, since the per-person cap is a count no
  rule can hold; the rules refuse a client-written reserva request.
- **Closing days:** `setReservaBlackouts` (managers) replaces the list; newly closed days
  decline their live bookings and free their locks in one transaction, and the bookers
  hear "Reserva anulada". Clients may edit the rest of the config but never `blackouts`.
- **Notices:** a pending booking tells the managers; an answer tells the booker; a booking
  that confirmed itself, and a confirmed one its booker lets go, tell no one. The reminder
  rides on `sendEventReminders` (hourly) rather than a scheduler of its own: bookings
  starting 30–90 minutes out, `cosa_<requestId>_reminder`, created never overwritten.
  Index `cosaKind + status + startAt`.
- **Screens:** the offer form's kind toggle gains *Reserva* and its config fields, and is
  shown only for a new cosa (the kind is frozen). A reserva's screen shows "Mis reservas",
  a day picker over the horizon and the day's slots (free, taken, mine, past); its
  manager closes and reopens days. Booking rows show their slot.
- **Migration:** `scripts/backfill-cosateca-reservas.mjs` (pre-deploy, autoApply): `reserva:
  null` on cosas and `startAt`/`endAt: null` on requests, dev only in practice.

## Left for later

- What happens to an integrante's cosas when they leave the group (today: they stay,
  managed by the owner; the group's admins can delete them).
- More than one photo; a waiting list on a lent cosa ("avísame cuando vuelva").
- A reserva's hours changed under existing bookings leave them standing, even off the
  new grid; a deleted reserva leaves its slot locks behind, like its requests.
- A cap on one user's open requests for the same cosa (today each one is a push to the managers); a deterministic id like `${cosaId}_${uid}` would hold it.
