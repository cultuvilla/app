# Mis grupos — the toolkit for running an asociación

**Priority:** high
**Landed:** none
**Gate:** none
**Next:** Phase 3 (cuota de socios) — write its plan section against the Phase 1 roster model below, then build it

Decided 2026-10-20 (user): build all five phases, taking the agent's picks on the
open questions (recorded under *Decisions* below).

> Design from a brainstorm on 2026-10-20. The first real user is **Asociación La
> Anduela**. Ideas are borrowed from Spond, Wild Apricot, Membermojo, Todoist,
> Asana, Sweepy, BAND and Basecamp (sources at the bottom). The scope is all of it;
> the build is split into the phases below, each one shippable on its own.

## Why

Organizations today can publish events and keep a member list, and that is all. A
village asociación also has to do the year's chores (asamblea anual, insurance,
fiestas), collect the cuota de socios, tell every socio what is going on, and keep
the records Spanish law asks of it. Today that happens in WhatsApp groups, paper
lists and the treasurer's memory. Mis grupos puts the work of *running* the group
in the app, next to the group's events.

**Success:** La Anduela runs one full year on it: the cuota is collected and
tracked in the app, the fiestas checklist is reused from last year's, and the junta
stops keeping a parallel paper list.

**Anti-goals:**
- **Not Clupik.** No accounting, invoicing or sports-club feature list. Every tool
  must be usable by a 70-year-old treasurer on a phone.
- **No leaking contact details.** Under the RGPD (AEPD report 0514/2009) socios
  must not see each other's phones and emails unless the estatutos allow it. Only
  group admins see contact data.
- **No money held by Cultuvilla.** Payments happen off-app (cash, Bizum, transfer)
  or straight to the association's own account. The app tracks them; it does not
  move them.

## What exists to build on

- Orgs: [OrganizationDataModel.ts](../../../packages/shared/src/models/organization/OrganizationDataModel.ts),
  members at `organizations/{orgId}/members/{uid}` with `role: 'admin' | 'member'`,
  role changes only through `changeOrgMemberRole` and the `membershipEvents/` log.
- Events link to orgs via `organizerOrgIds`. Per-event payment is `requiresPayment`
  plus `registration.paidAt`, marked by hand.
- Notifications: in-app (`users/{uid}/notifications`), push (FCM/APNs, live in
  prod), email through Resend ([eventEmail.ts](../../../functions/src/events/eventEmail.ts)).
- `users.telephone` exists (nullable). There is no WhatsApp sending; there is a
  share target ([useShareDeepLink.ts](../../../apps/mobile/lib/deeplink/useShareDeepLink.ts)).
- The user menu already shows items conditionally
  ([UserMenuModal.tsx](../../../apps/mobile/components/feature/UserMenuModal.tsx)),
  and the profile lists the user's orgs ([useProfileData.ts](../../../apps/mobile/lib/profile/useProfileData.ts)).

## Phase 1 — Mis grupos, and the admin panel

- **Entry point:** a **Grupos** bottom tab, present only when the user belongs to at
  least one organization (`watchOrgMembershipsByUser`); hidden with `href: null`
  otherwise. *(My call: the request was a navigation button; a conditional tab is
  the literal reading. The user menu is the fallback if four tabs feel crowded.)*
- **Group switcher** at the top of the tab: the user's groups, last-used one
  remembered. With one group there is no switcher.
- **Which groups get what:** tasks, messaging and notices for every org type. Cuota,
  libro de socios and actas for `asociación`, `peña` and `otros`, not `ayuntamiento`.
  *(My call.)*
- **Group home** for a member: what's next (my tasks, upcoming events, my volunteer
  shifts), my cuota status, pinned notices.
- **Admin panel** (admins only, same tab, a "Gestionar" section): members and roles
  (reusing `OrgMembersList` / `OrgJoinRequests`), the cuota settings, messaging,
  task templates, records. Settings live on the org or under it, never on the user.
- Only the *private* side of the group lives here. The public org page
  (`entidad/[entidad]`) stays as it is; nothing in Phases 1–5 is public, so none of
  it needs a read-site page.

### Phase 1 — as built

Shipped in one PR (`feat/group-toolkit-phase1`). Later phases build on this model:

- **Roster:** `organizations/{orgId}/socios/{socioId}` (`SocioDataModel`): `kind`
  (`member` | `persona` | `typed`), `displayName` (point-in-time copy), `uid`
  (member rows), `personId`, `responsibleUid` (persona rows), `adminTitle`
  (`presidente` | `secretario` | `tesorero` | `vocal` | `otro`, display only),
  `altaAt`, `bajaAt` (null = active; rows are never deleted), `memberJoinedAt`
  (member rows: the member doc's `joinedAt`, i.e. which membership the row belongs
  to), `createdBy`. Auto ids. Rejoining after a baja opens a new row; the old one stays.
- **Persona uniqueness:** `organizations/{orgId}/socioPersonaLocks/{personId}` =
  `{ socioId }` while that persona is an active socio, written and deleted in the
  same batch as the row's alta and baja; rules refuse a second create. A persona must
  be the caller's, accountless and alive.
- **Contact:** `organizations/{orgId}/socioPrivate/{socioId}` — `phone`, `email`,
  `consentAnsweredAt`. Org admins and the socio read it. A member writes their own
  (the consent card, shown on the org page right after joining and in the Grupos
  tab); an admin writes a typed socio's. Persona rows have none — contact goes to
  `responsibleUid`.
- **Functions:** `syncOrgSocioRoster` (trigger on `organizations/{orgId}/members/{uid}`;
  every event reconciles transactionally against the current member doc: alta if
  needed — adopting the active persona row of the user's own `personId` —, baja for a
  non-member and their personas, baja of an earlier membership's row on rejoin,
  title cleared for a non-admin; no-op for the ayuntamiento) and
  `linkSocioToMember` (callable, org admins: merges a typed row into the member's
  row, keeps the earlier alta, the member's own consent answer wins).
- **Setting:** `organizations.sociosListVisible` (default false) — members read all
  roster rows (names only) when on.
- **Backfills:** `socio-roster` (reconciling: alta for members with no active row,
  baja for rows whose member left) and `org-socios-list-visible`; both `pre-deploy`,
  auto-applied.
- **App:** `app/(tabs)/grupos.tsx` (tab hidden with `href: null` unless
  `watchUserOrgMemberships` finds a group), components under
  `components/feature/groups/`, last group in AsyncStorage (`lib/orgs/lastGroup.ts`).
- **Left for later:** cuota, tiers and households (Phase 3); messaging and notices
  (Phase 4); tasks (Phase 2); actas and libro export (Phase 5). The member home shows
  no cuota/tasks/notice placeholders until those exist. `displayName` on member rows
  is not re-synced when a user renames. A Maestro flow for the tab (its testIDs are
  unit-tested only, see `e2e/native/uncovered.json`).

## Handoff

The `socio-roster` backfill auto-applies before each env's deploy, i.e. before the
trigger exists there: a member who joins or leaves in that window is missed until
the backfill is re-run (`pnpm backfills:run --id=socio-roster --env=<env> --apply`;
it reconciles both ways). Re-run it on each env right after the promotion deploys.

## Phase 2 — Tasks

All tasks belong to an org: `organizations/{orgId}/tasks/{taskId}` (owned data, per
invariant 3). Any member can see the group's tasks; admins create, assign and edit;
an assignee can mark their own task done. *(My call: members see tasks so they know
what is going on; whether members can create tasks is a later setting.)*

- **Recurring tasks, two kinds** (Todoist `every` vs `every!`):
  - **Fixed date:** "every year on 15 March" — the asamblea, the insurance renewal.
  - **After completion:** "12 months after it was last done" — check the fire
    extinguishers. The next occurrence is created when the current one is closed.
  - Monthly and yearly are enough; no RRULE editor.
- **Event checklists from templates** (Asana relative dates): a template ("Fiestas de
  agosto") holds tasks with due dates relative to one anchor — "book the band, 60
  days before". Attaching the template to an event (or a bare date) generates the
  tasks. Next year: same template, new date. A checklist created by hand can be
  saved as a template.
- **Volunteer shifts** (Spond): a task with N slots and a time ("4 people for setup
  at 10:00"). Members claim a slot; a cap and a waiting list; a reminder to members
  who have not answered 48 h before.
- **Reminders:** push + in-app before a task is due and when it is overdue, through
  the existing push pipeline and quiet hours.
- **Fair share** (Sweepy): an admin view of tasks done per member this year. Members
  don't see it. *(My call: a public ranking reads as shaming in a village.)*

## Phase 3 — Cuota de socios

- **Cuota settings per org:** amount, period (yearly by default, monthly possible),
  the date it falls due, a grace period. Optional **tiers** (reduced for jubilados,
  family cuota) and per-member **exemption** (Spond).
- **Status per socio per period:** *al día / pendiente / vencida* (Wild Apricot),
  computed from the payment record and the grace period.
- **Recording a payment:** an admin (the treasurer) marks it paid with **method**
  (efectivo / Bizum / transferencia / domiciliación), date, amount, and an optional
  note. Who recorded it and when is stored. Payments are append-only; a mistake is
  corrected with a reversing entry, never edited away.
- **The member sees** their own status and history, plus *how to pay*: the
  association's Bizum number or IBAN and the suggested concept ("Cuota 2026 —
  Nombre"), which the admin configures.
- **Reminders in the treasurer's name** (Membermojo): before the due date and once
  after it, by push + email, signed by a named admin, not "Cultuvilla".
- **Export:** the period's list (socio, status, method, date) as CSV, reusing the
  roster-export approach (`RosterExportButton`).
- **Later, not in this phase:** a SEPA remesa (pain.008) export from the socios list
  for associations collecting by direct debit (mandates, IBANs, creditor ID), and
  optional card payments through Stripe with the fee passed on. Both need their own
  design.
- Event payments keep using `registration.paidAt`; they appear in the group's money
  view but are not merged into the cuota model.

## Phase 4 — Messaging

- **Compose once, send to all or to a subset:** all socios, the junta, socios with a
  pending cuota, volunteers of one event.
- **Channels per member, with fallback** (Spond): push for app users; **email** for
  everyone with an address (Resend, gives a delivery record); **WhatsApp** by
  one-tap `wa.me/<phone>?text=…` links the admin sends from their own phone, one
  after another, each ticked off as sent. No WhatsApp Business API: it needs
  pre-approved templates, opt-in and pays per message. *(Revisit if a group outgrows
  hand-sending.)*
- **Pinned notices** (BAND): a message can be pinned to the group home; admins see
  who has read it and can nudge only those who haven't.
- **Polls:** a yes/no or multiple-choice question attached to a notice ("¿Fecha de
  la cena: 12 o 19?").
- Every sent message is kept in the group's history with its recipients and
  channels.
- Members can mute a group's pushes but not its emails about their own cuota.

## Phase 5 — Records (libro de socios, actas, cuentas)

- **Libro de socios:** each socio's alta and baja with dates. A socio who leaves is
  marked *baja* with a date, never deleted. Rebuilt from the membership-events log
  where it exists.
- **Asamblea anual:** a recurring task created by default for every asociación
  (Phase 2), with an agenda.
- **Actas:** a simple form per meeting — body, date, place, attendees, agenda,
  agreements — kept in date order and exportable as PDF.
- **Yearly summary:** income (cuotas, event payments, other entries an admin adds)
  and expenses, exportable for the asamblea to approve. A summary, not bookkeeping.

## Decisions — socios, roles, contact data

Decided 2026-10-20 (user): the user's answers on socios; the agent's picks on the rest.

- **Every member is a socio** (user, 2026-10-20). Joining the group makes you a
  socio: you owe the cuota and appear in the libro de socios. The roster lives at
  `organizations/{orgId}/socios/{socioId}` and has three kinds of row:
  - **Member** — one per `organizations/{orgId}/members/{uid}`, created and given a
    baja by a trigger on that membership, so the two never drift.
  - **Persona a cargo** — family members who don't join themselves are added by the
    member as their *personas a tu cargo* (the existing `persons` with
    `createdBy == uid`). The row points at the `personId` and at the responsible
    member's `uid`; reminders and messages for it go to that member. If the persona
    later joins with their own account, the member row replaces it (same alta date).
  - **Typed in by an admin** — for socios who never install the app: name, optional
    phone and email. An admin links it to a `uid` if that person joins later.
  - Contact data lives on the roster row only (never on `persons`, which is a public
    genealogy record). Cuota, libro and messaging key on `socioId`; tasks and shifts
    key on `uid` (they need an app user).
- **Family cuota:** a tier can cover a member and their personas a cargo — one
  payment against the member marks the whole household paid for the period.
- **Roles stay `admin | member`.** An admin may carry an optional **title**
  (presidente, secretario, tesorero, vocal…), shown in the panel and used as the
  signature on reminders. Titles grant no powers; any admin may record payments and
  write actas. No new function-owned role.
- **Contact data:** only org admins read socio phones and emails, from the roster
  (never from `users`). When a member with an account becomes a socio, they confirm
  once, on joining, that the junta may see their phone and email, and choose which to share. A
  per-org setting *"los estatutos permiten ver la lista de socios"* (default off)
  lets socios see names only — never contact data.

## Build order

1. Phase 1 (Grupos tab + admin panel shell)
2. Phase 3 (cuota) — the most concrete pain for La Anduela *(my call)*
3. Phase 4 (messaging) — the cuota reminders need it
4. Phase 2 (tasks)
5. Phase 5 (records)

Each phase is its own plan in `ready/` when it starts, built through `ship-a-feature`.

## Left to the builder

Collection and field names, indexes, rules (follow `shared-entity-capability-policy`
if it lands first), how statuses are computed (trigger vs on read), the tab icon,
screen layouts within the existing primitives, i18n keys, CSV/PDF libraries.

## Sources

- LO 1/2002 obligations: https://velezmalaga.es/contenido/datos/participacion_ciudadana/documentos/spYLpP_CUADERNO-BASICO-ASOCIACIONES.pdf
- RGPD and member lists: https://www.aepd.es/documento/2009-0514.pdf
- Wild Apricot renewals: https://support.wildapricot.com/hc/en-us/articles/24302322019981-Membership-renewal-settings
- Membermojo reminders: https://membermojo.co.uk/mm/help/welcome/moving-to-membermojo
- Spond payments and events: https://help.spond.com/club/en/articles/188096-managing-payment-requests-in-spond-club, https://help.spond.com/en/articles/26059-spond-app-understanding-event-settings
- Todoist recurrence: https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV
- Asana relative dates: https://forum.asana.com/t/relative-due-dates-in-custom-project-templates/783408
- WhatsApp Cloud API pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Click-to-chat links: https://support.dotdigital.com/en/articles/11331301-click-to-chat-for-whatsapp
- GoCardless pricing: https://gocardless.com/en-eu/pricing
