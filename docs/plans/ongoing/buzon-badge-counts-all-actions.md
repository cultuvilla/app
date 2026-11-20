# The bell badge counts every request you can act on

**Priority:** medium — admins don't see pending join requests or open reports on the bell, only on the Buzón itself
**Landed:** dev
**Gate:** soak:the next release Álvaro cuts carries #699 to prod
**Next:** witness docs/qa/pending/buzon-badge-all-actions.md on a device once on prod, then retire the plan (watch* follow-up for read cost is in #699's body)

Decided 2026-11-20 (user): approve — the badge should count join requests and open reports too, not only Embajador and new-group requests.

**Goal:** the bell badge counts the same actionable work the Buzón's *Necesita tu acción* shows, so an admin with a pending join request or report sees it without opening the Buzón.

## Context
As of `4b30925f` (2026-11-20), `apps/mobile/lib/hooks/useUnreadInboxCount.ts` counts only organizer and org-creation requests. Join requests (133c4869) and open reports (b56e0d07) were added to the Buzón but never to the badge. `buzon-inbox-model` moves the queue definition into `inboxService.getActionableRequests(scope, kinds?)` and keeps the badge at `kinds: ['organizer','orgs']`.

## Design
Once `buzon-inbox-model` has landed, widen the badge's `kinds` to include `joins` and `reports`, and reuse the same scope. Watch the read cost: the badge runs on every header, so per-org join reads and per-village report reads multiply by how many groups and villages the user administers. Prefer a cheap count query, or a read the Buzón already caches, over N reads per header render. Cosateca stays out: it is not an approver queue (the agent's pick, which the user approved).
**Testing strategy:** the hook test asserts the count for each scope (super admin, village admin, org admin, none), plus a test that the badge and the Buzón agree for the same scope.

## Paths
`apps/mobile/lib/hooks/useUnreadInboxCount.ts` and its test; `packages/shared/src/services/inboxService.ts` (a count variant if one is needed); a QA entry `docs/qa/pending/<slug>.md`.

## Approval
Approved by the user on 2026-11-20 (above). User-visible: the badge number changes for admins.

## Out of scope
Counting cosateca. Moving the Buzón to `watch*` reads.
