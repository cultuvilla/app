# Unified inbox (Buzón) — one surface, two data sources

## Context

Solicitudes (the requests screen) and notifications were two adjacent
"inbox" concepts. Notifications already shadowed the request flows — a
created request wrote both a pending doc (shown in Recibidas) *and* a
`*_request_created` notification to each approver — yet the notification
system had **no UI at all**: no screen, no bell, no badge, and
`org_approved`/`org_rejected` were declared-but-never-written enum values.
The two look like the same thing to a user ("my inbox") but are not the same
data: Solicitudes reads live, mutable source-of-truth request docs
(`organizerRequests`, pending `organizations`, join requests) and mutates
them on approve/reject; notifications are an append-only, immutable event
log at `users/{uid}/notifications`.

## Decision

- **Converge the surface, not the storage.** One screen (`/inbox`, "Buzón")
  renders a single feed from **two sources kept separate underneath**:
  *actionable* items come from the live request queries (role-branched via
  `useApproverStatus`, unchanged from the old Recibidas); *activity* items
  come from the notification log plus the user's own still-pending sent
  requests. They are merged only at read time by a pure combiner
  (`inboxService.buildActivityFeed`) — no new collection, no dual-write, no
  reconciliation between a notification and the request it refers to.
- **Actionable pinned above activity.** Requests awaiting the user's decision
  render with inline approve/reject at the top; everything else is read-only
  below. For a non-approver the actionable group is empty and the feed is
  pure activity.
- **The actionable card is the sole surface for incoming requests.** The
  redundant approver-side `*_request_created` notifications were dropped
  (they duplicated what the live request list already shows). Requester-facing
  `*_resolved` notifications stay.
- **Org outcome notifications via a Firestore trigger, not the callables.**
  `onOrganizationUpdated` emits `org_approved`/`org_rejected` on the
  `pending → approved|rejected` transition. Keying off the status transition
  (not the writer) covers **both** paths uniformly — approval is a callable,
  rejection is a client write — with one handler.
- **Entry point + badge:** the header bell opens `/inbox`; its unread badge is
  a live listener on the unread notifications (`watchUnreadCount`) plus a
  role-branched pending-actionable count, the latter refreshed on header focus.
  Mark-all-read fires on open (v1).

## Rejected alternatives

- **Merge the data models** (drive everything off notification docs, kill the
  pending-doc reads). Rejected: you lose the natural "read the pending docs"
  query, must reconcile immutable notification state against mutable request
  state (two admins, one already approved → stale notification), and the
  outbox/"what am I waiting on?" view isn't a notification at all.
- **A denormalized unread counter.** Not built — a per-launch count query is
  fine at current scale. Revisit if read cost bites.
- **Keeping Solicitudes as a separate screen and only building a notifications
  bell.** Rejected: leaves two inbox-like surfaces for one mental model.

## What this binds

- New "things that land on a user" split by nature: actionable → a live
  request query surfaced in the pinned group; informational → a notification
  type surfaced in the activity feed. Don't write an approver notification for
  something already visible as an actionable card.
- `buildActivityFeed` must stay pure (no I/O, no `Date.now`/`new Date`); its
  inputs are fetched by the screen/service layer.
- Adding an org lifecycle outcome means extending `onOrganizationUpdated`
  (status-transition-keyed), not sprinkling notification writes across the
  approve/reject code paths.

## Revisit when

- The pending-actionable badge count or the activity feed's per-launch reads
  become a measurable cost → introduce a denormalized counter / read model.
- A request type gains a state where the immutable-log vs live-doc split stops
  holding (e.g. requests that mutate after resolution).
