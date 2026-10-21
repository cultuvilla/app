# Mis grupos — the toolkit for running an asociación

**Priority:** high
**Landed:** none
**Gate:** none
**Next:** Phase 5 (records) — libro de socios, actas, yearly summary; its *asamblea anual* is a Phase 2 calendar-recurring task created by default (see *Phase 2 — as built*), and it builds on the roster, cuota and messaging models described under each *as built*

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

### Phase 2 — as built

Shipped in one PR (`feat/group-toolkit-phase2-tasks`), for every org type (the
ayuntamiento included — tasks key on `uid`, not on the socio roster).

- **Data** (`GroupTaskDataModel`; days are Madrid day keys like the cuota's):
  - `organizations/{orgId}/tasks/{taskId}` — `title`, `notes`, `assigneeUids`,
    `dueOn`, `time` (`HH:MM`), `slots` (set = a volunteer shift; needs `dueOn`),
    `claimedUids` / `waitlistUids` / `declinedUids` (function-owned), `recurrence`
    (`{ kind: 'calendar' | 'afterDone', unit: 'month' | 'year', interval 1–24,
    anchorOn }` — `anchorOn` is the series' first day, so "the 31st" survives
    February), `nextTaskId` (function-owned), `eventId` (the checklist it is on),
    `doneAt` (server time) / `doneBy`, `createdBy`, `createdAt`. Members read all;
    admins create/edit/delete; an assignee may only flip `doneAt`/`doneBy` on their
    own task. Rules keep the answer lists and `nextTaskId` untouchable by clients
    and `slots` ≥ the people already in.
  - `taskTemplates/{id}` — `name`, `items[]` (`title`, `notes`, `offsetDays`
    ±730, `time`, `slots`), `updatedBy`, `updatedAt`. Admins only. No assignees:
    people change year to year.
  - `taskReminders/{taskId}_{stage}_{uid}` — function-owned send record
    (`stage` `before` | `overdue` | `shift`); admins read it.
- **Logic** (pure, unit-tested): `packages/shared/src/models/organization/groupTaskLogic.ts`
  — `nextDueOn` / `nextOccurrence` (calendar: first series date after both the
  due day and the done day; afterDone: N after the done day), `tasksFromTemplate`,
  `templateItemsFromTasks`, `answerShift` / `promoteWaitlist`, `shiftStartsAt`
  (`madridInstant`, added to FiestaBlockModel), `dueTaskReminders`,
  `fairShareCounts` (shift → volunteers, else assignees, else who ticked it).
- **Functions** (functions/src/organizations/):
  - `onGroupTaskUpdated` (trigger): a done recurring task with no `nextTaskId` gets
    its next occurrence and the id, in one transaction — once, even across
    undo/redo; a shift with free slots and a waiting list (admin raised `slots`)
    promotes from its head.
  - `respondToTaskShift` (callable, members): `claim` | `decline` | `withdraw`, in
    a transaction (cap held, waiting list when full, a freed slot promotes the
    head); refuses a done or past shift.
  - `sendGroupTaskReminders` (`onSchedule` `every day 10:00` Europe/Madrid, the
    single group-tasks schedule): one collection-group query (`doneAt == null`,
    `dueOn` in [today−7, today+2]; composite index `tasks` doneAt+dueOn,
    COLLECTION_GROUP) covers `before` (two days up to the due day: assignees, or a
    shift's volunteers), `overdue` (once, within a week: assignees; never a
    shift) and `shift` (a shift short of people starting within 48 h: every member
    who has not answered). Records are claimed in a transaction before sending.
  - Notifications are one type, `group_task` (category `mine`, routed to
    `/grupos?grupo=<orgId>` like `cuota_reminder`), written by
    `groupTaskNotify.ts`; the 10:00 schedule keeps reminders out of quiet hours.
    Push only — no email for tasks.
- **App:** `MyTasks` on the group home (my open tasks with a tick; upcoming
  shifts with Me apunto / No puedo / lista de espera — admins also see names);
  `TasksAdmin` first in Gestionar (open tasks, done this year, per-event
  checklists of the group's upcoming events with add / apply template / save as
  template, templates, fair share). Sheets: `TaskSheet`, `TemplateSheet`,
  `ApplyTemplateSheet`. Member names come from `lib/orgs/useOrgMembers.ts`.
- **Left for later:** members creating tasks (a setting); a notification when
  someone is assigned; email reminders for tasks; overdue reminders for unassigned
  tasks (admins see them in the list); a shift reminder more precise than the
  daily run (it lands 24–48 h ahead); editing a template item's notes/time in the
  form (kept from a saved checklist, not editable); a checklist for a past event;
  no Maestro flow for the task screens (unit-tested, see `e2e/native/uncovered.json`).

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

### Phase 3 — as built

Shipped in one PR (`feat/group-toolkit-phase3-cuota`). Only orgs with a socio roster
(`hasSocioRoster`) have a cuota; rules check it on the settings write.

- **Data** (`CuotaDataModel`, amounts in integer euro cents):
  - `organizations/{orgId}/cuotaSettings/current` — `amountCents`, `periodicity`
    (`yearly` | `monthly`), `dueMonth` (yearly only), `dueDay` (clamped to the month),
    `graceDays`, `startPeriod` (first tracked period; earlier ones owe nothing; reset
    to the current period when the periodicity changes), `tiers[]` (`id`, `name`,
    `amountCents`, `coversPersonas`), `bizum`, `iban`, `payInstructions`,
    `remindersEnabled` (off on first configuration, so nobody is reminded before the
    paper payments are recorded), `configuredBy` (last admin who saved), `updatedAt`
    (server time). Members read it; admins write it.
  - `cuotaAssignments/{socioId}` — `tierId`, `exempt`, `customAmountCents` (wins over
    the tier), `updatedBy`, `updatedAt`. No doc = base cuota.
  - `cuotaPayments/{paymentId}` — append-only ledger: `socioId`, `periodKey` (`YYYY` |
    `YYYY-MM`), `kind` (`payment` | `reversal`), `reversesId`, `amountCents`, `method`
    (`efectivo` | `bizum` | `transferencia` | `domiciliacion`), `paidOn` (Madrid day
    key), `note`, `recordedBy`, `recordedAt` (server time). Rules refuse update and
    delete; a reversal lives at `rev_<paymentId>` and must copy the payment's socio,
    period and amount, so each payment is reversed at most once. Admins record; a
    member reads the entries of the rows they are or answer for (`isMySocioRow`, one
    `socioId ==` query per row). `linkSocioToMember` re-points a merged row's entries
    and assignment to the surviving row — the only rewrite of a ledger entry.
  - `cuotaReminders/{periodKey}_{stage}_{socioId}` — function-owned record of what was
    sent (`stage` `before` | `after`, `recipientUid`, `push`, `email`, `signerName`,
    `sentAt`); admins read it ("Recordatorio enviado el …").
- **Status on read**, never stored: `computeCuotaStatuses` in
  `packages/shared/src/models/organization/cuotaStatus.ts` (+ `periodKeyFor`,
  `periodDueDay`, `owedCents`, `netPaidBySocio`, `cuotaReminderStage`, `cuotaSigner`,
  `cuotaConcept`, `parseEuroCents`). Al día when net paid ≥ owed (or exempt);
  pendiente until `dueOn + graceDays`; vencida after. `dueOn` is the period's due day,
  or the socio's alta when later. A socio is listed for a period they were a socio in
  any part of. A persona a cargo whose responsible member is on a `coversPersonas`
  tier follows that member's status (`basis: 'household'`) and is never reminded.
- **Reminders:** `sendCuotaReminders` (functions/src/organizations/), `onSchedule`
  `every day 10:00` Europe/Madrid — the daytime schedule is what keeps it out of quiet
  hours, since the notification type sits in the `mine` category. It walks
  `collectionGroup('cuotaSettings')` (unfiltered: no index), skips orgs with reminders
  off, computes today's statuses, and sends `before` in the 7 days up to `dueOn`
  (`CUOTA_REMINDER_LEAD_DAYS`) and `after` once vencida — only to active socios.
  Recipients are grouped per account and stage: a member hears once about themself
  and the personas they answer for; a typed socio gets email only when `socioPrivate`
  has an address. Each socio's record is created in a transaction *before* sending,
  so a retry sends nothing twice (a send that fails after the claim is logged, not
  retried). Push = a `users/{uid}/notifications` doc of type `cuota_reminder`
  (`entityKind: 'organization'`, `entityId: orgId`; routed to `/grupos?grupo=<orgId>`
  by `notificationRoute`, which the Grupos tab reads; older clients drop the row from
  the Buzón or open the org page) — the existing pipeline applies prefs and quiet
  hours. Email = Resend through the new shared transport
  `functions/src/shared/email.ts` (`sendEmail({ to, subject, html, text, fromName }, {
  handler, label, fields })` → `'sent' | 'skipped' | 'failed'`, never throws;
  `eventEmail.ts` now uses it too) with the template
  `packages/shared/src/email/cuotaReminderEmailTemplate.ts`; From is "<org> (vía
  Cultuvilla)", the body is signed by `cuotaSigner` (admin titled tesorero → admin who
  configured it → any titled admin → any admin → "La junta de <org>"). Address: the
  email the socio shared in `socioPrivate`, else the account's.
- **App:** member card `MyCuota` (status per own/persona row, how to pay with the
  suggested concept "Cuota {periodo} — {nombre}", full history with anulaciones) and
  admin `CuotaAdmin` in Gestionar (period stepper, status filter, record payment,
  reverse, tier/exemption/custom amount, reminder-sent line, Excel/CSV export via the
  generic `ExportButton` extracted from `RosterExportButton`; the export model is
  `buildCuotaExport` in `packages/shared/src/export/cuotaExport.ts`, a
  `RosterExportModel`, which now carries a `summary` line and an `euros` column type).
- **For Phase 4:** reuse `sendEmail` for message emails; write one notification doc
  per recipient and let `onNotificationCreated` push; group recipients per account the
  way `groupReminders` does (persona → `responsibleUid`, typed → `socioPrivate.email`);
  record sends in a per-org log like `cuotaReminders`. A group-level push category (so
  members can mute a group's pushes but not cuota emails) does not exist yet —
  `cuota_reminder` is in `mine`.
- **Left for later:** SEPA remesa, Stripe, event payments in a money view; a reminder
  whose send fails after its record is written is not retried; no Maestro flow for the
  cuota screens (unit-tested, see `e2e/native/uncovered.json`).

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

### Phase 4 — as built

Shipped in one PR (`feat/group-toolkit-phase4-messaging`). Only orgs with a socio
roster (`hasSocioRoster`) message; the ayuntamiento has vecinos and the village's
own notifications.

- **Data** (`GroupMessageDataModel`):
  - `organizations/{orgId}/messages/{messageId}` — `title`, `body`, `audience`
    (`kind` `all` | `junta` | `cuota` | `event`, `eventId`, `eventTitle` copy),
    `channels` (`push`, `email`, `whatsapp` `none` | `fallback` | `all`), `pinned`,
    `poll` (`question`, `kind` `yes_no` | `choice`, `options[]` labels — a yes/no
    poll stores the localized "Sí"/"No"), `recipientUids` (the accounts reached in
    the app — what lets a recipient read it), `recipientCount`, `pushCount`,
    `emailCount`, `whatsappCount`, `sentBy`, `signerName`, `signerTitle`, `sentAt`,
    `nudgeCount`, `lastNudgedAt`. The id is minted by the composer, so a retried
    call sends nothing twice. Function-written; an admin may only flip `pinned`.
  - `messages/{id}/deliveries/{uid | typed_<socioId>}` — `uid`, `socioIds`,
    `names`, `push`, `email` (`pending` | `sent` | `failed` | `skipped` | null),
    `whatsappSocioId` (whose shared phone the link uses; null = no WhatsApp),
    `whatsappSentAt` / `whatsappSentBy` (the admin's tick, the only client write).
    Admins only. This and the message are the per-org send log.
  - `messages/{id}/reads/{uid}` (`readAt`, created once by the recipient) and
    `messages/{id}/votes/{uid}` (`option` index, `votedAt`; one per account,
    replaceable). Admins read all; a member reads only their own — voter identities
    stay with the junta.
  - `users/{uid}/groupPrefs/{orgId}` — `messagesMuted`, `updatedAt`. Optional like
    the account's prefs (no doc = pushes).
- **Callables:** `sendGroupMessage` (admins; RESEND secret, 300 s) resolves the
  audience — active socios, the junta (admin member rows), the socios whose current
  period is pendiente or vencida (`computeCuotaStatuses`), or one org event's
  registrations grouped per `userId` — grouping rows per account like the cuota
  reminders (persona → `responsibleUid`, typed → `typed_<socioId>`), writes the
  message, deliveries and one `group_message` notification per account (the sender
  excepted; `onNotificationCreated` pushes), then emails everyone with an address
  (the socio's shared one, else the account's) through `sendEmailBatch` (Resend's
  batch API, 100 per request — added to `functions/src/shared/email.ts`), From
  "<org> (vía Cultuvilla)", signed by the sending admin and their `adminTitle`
  (`groupMessageEmailTemplate.ts`). WhatsApp: `whatsappSocioId` is set when the
  contact row has a phone `normalizeLeadPhone` accepts and the mode asks for it
  (`fallback` = reached by neither push nor email). An event registrant who is not a
  socio gets push and their account email, never WhatsApp. `nudgeGroupMessage`
  (admins) pushes the unread with the app again (`…_nudge<n>` ids), at most every
  12 h per message (`GROUP_MESSAGE_NUDGE_INTERVAL_MS`), and spends nothing when all
  have read.
- **Push category:** a fourth category `groups` (Android channel "Mis grupos") for
  `group_message`. It is not a key of the account prefs doc — adding one would make
  installed clients' full-doc prefs writes fail rules or the strict converter — so
  `allowsPush` passes it and `onNotificationCreated` checks the group's
  `groupPrefs` instead. `cuota_reminder` stays `mine` and never reads it.
  `NOTIFICATION_PREF_KEYS` is the three account toggles.
- **App:** `GroupMessagesAdmin` in Gestionar (composer `ComposeMessageSheet`,
  history, `MessageDetailSheet`: read by x of y with the unread names and the nudge,
  poll results with voters, the WhatsApp list — `wa.me` link with the text from
  `groupMessageWhatsappText`, ticked on open, untickable — and every recipient's
  channels, pin/unpin); `GroupNotices` on the member home (messages that reached
  them, pinned first, marked read when shown, poll answered with one tap, the
  group's mute toggle). Composer logic is `lib/orgs/messaging.ts`.
- **Left for later:** members do not see poll totals; no edit or delete of a sent
  message (unpin only); a message's emails are not retried if the batch fails
  (recorded as `failed` on the delivery); the WhatsApp text is sent in Spanish;
  messaging for the ayuntamiento; no read-site page (private, as planned); no
  Maestro flow (unit-tested, see `e2e/native/uncovered.json`).

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
