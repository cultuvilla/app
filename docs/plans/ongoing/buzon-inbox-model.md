# One definition of the Buzón's actionable queues

**Priority:** medium — the Buzón gained three actionable queues in seven weeks (join requests, open reports, cosateca) and the bell's badge hook, whose comment says it mirrors the screen, was touched by none of them
**Landed:** dev
**Gate:** soak:the first release carrying #683 is live in prod
**Next:** once prod serves #683, check an admin's Buzón and bell badge show the same requests as before, then retire

**Goal:** Move "which request queues does this approver read, and how are they fetched" out of `apps/mobile/app/buzon/index.tsx` into one tested `inboxService` function that both the Buzón and the bell's badge call, so a new request type is added in one place and the badge can no longer drift from the screen without anyone noticing.

## Context

As of `129efeb7` (2026-11-20), 90-day window:

- `apps/mobile/app/buzon/index.tsx` is 701 lines, churn 12, 4 fix commits. The four fixes in the window are UI and routing (`2ca83ec3` an unreadable notification trapping the app on iOS, `d15dcd94` and `f5e9a192` a11y press catchers, `259c9a67` village-first notification routes). The older fixes were in the aggregation itself: `2c59d56a` (super admins saw org-creation requests from only some villages), `3b91b232` (join rows showed org ids, not names — in the legacy join flow that `94391b30` removed on 2026-07-18; today's join queue came back with `133c4869`), `418a6cca` (a guard against refetching requesters).
- In `InboxScreen`, `loadData` holds the scoping rule inline: a super admin reads `getPendingOrganizerRequests` + `getPendingOrganizations`, a village admin reads `getOrganizationsByMunicipality(vid, 'pending')` per village, an org admin reads `getPendingOrgJoinRequests(oid)` per org (each one allowed to fail alone). A separate `useFocusEffect` holds a second copy of the super-admin-or-village-admin branching for reports (`getOpenReports` / `getReportsByMunicipality(vid, {status:'open'})`), then counts them per village. Name hydration (requesters, municipalities, org names) is about 60 more lines of the same callback.
- `apps/mobile/lib/hooks/useUnreadInboxCount.ts` (`useUnreadInboxCount`, the header bell) holds a third copy of the branching. Its comment says it "mirrors the role-branching in apps/mobile/app/inbox/index.tsx so the badge and the Buzón screen never disagree". The path is stale (the screen moved to `buzon/` in `bb4d3648`), and the claim is false. It counts organizer and org-creation requests only. Join requests (`133c4869`, 2026-09-30), open reports (`b56e0d07`, 2026-11-03) and cosateca requests (`8113de36`, 2026-11-10) were each added to the screen. The badge hook was last changed in `e9b23ae3` (2026-10-06). (The badge did count the legacy join requests until `94391b30` removed that flow.)
- `docs/decisions/unified-inbox.md` defines the badge as "a role-branched pending-actionable count", and `inboxService` already holds the other half of the Buzón: `buildActivityFeed` (pure) and `getMyPendingRequests` (the user's own sent requests). The actionable half has no service function.
- `loadData` reads `requesterByUid` and `municipalityNames` to skip names it already has, but leaves both out of its `useCallback` deps. So the skip always sees the first render's empty maps, and every reload fetches every name again. It reads more than it needs; nothing shown is wrong.
- Reads: the actionable queues and the activity feed are one-shot `get*` reads (`useEffect`; reports on `useFocusEffect`). Only the cosateca queue uses `watch*` + `useWatch`. AGENTS.md *State and data fetching* calls the one-shot shape legacy. That move is a separate change (see Out of scope).
- Tests: `apps/mobile/app/buzon/__tests__/index.test.tsx` (6 cases: reports scoping, cosateca, the pending-sent list) tests through the screen with every service mocked. `packages/shared/test/services/inboxService*.test.ts` covers `buildActivityFeed` and `getMyPendingRequests`. `useUnreadInboxCount.test.tsx` covers the badge. Nothing tests the organizer, org-creation and join scoping, apart from going through the screen.
- Dependency category: in-process scoping (pure) over local-substitutable service reads, which are mocked at the service boundary today, as `inboxService.pending.test.ts` does.

## Design

Three pieces, split by responsibility:

1. **Scope (pure, `packages/shared/src/services/inboxService.ts`).** `actionableScope(status)` maps `{ isSuperAdmin, adminVillageIds, adminOrgIds }` to the queues to read and how widely to read each: organizer requests (super admin only), org creation (all villages or the listed ones), join requests (the listed orgs), reports (all villages or the listed ones). This replaces the three hand-written copies of the branching.
2. **Fetch (`inboxService`).** `getActionableRequests(scope, kinds?)` runs the reads with today's failure rules unchanged: a failed join or report read for one org or village returns `[]`, and a failed org-creation read fails the whole call. It returns `{ organizer, orgs, joins, reports }`. Its signature is illustrative: `getActionableRequests(scope: ActionableScope, kinds?: ActionableKind[]): Promise<ActionableRequests>`. It lives next to `getMyPendingRequests`, which already does the same job for sent requests.
3. **Consumers.** The screen calls it in `loadData` and in the reports focus effect, which passes `kinds: ['reports']` so the reports still reload on focus as they do today. `useUnreadInboxCount` calls it with `kinds: ['organizer', 'orgs']` and sums the results. That keeps today's badge number exactly, but the subset is now written in one place, with a comment saying the subset is deliberate. The stale comment goes. Name hydration moves into a small `apps/mobile/lib/inbox/useInboxNames.ts` (new) whose cache is a ref, which fixes the stale-closure refetch. Inline approve/reject and the optimistic row removal stay in the screen. The cosateca queue is not an approver's queue (anyone who offered something answers it) and is already a live `watchCosaRequestsToAnswer` + `useWatch` read, so it stays where it is and is not a `kind` of `getActionableRequests`.

Nothing a user sees changes. The screen renders the same rows. The badge shows the same number, from the same reads. The screen reads fewer names on reload.

**Alternatives considered:**
- **A — extract only the pure `actionableScope`.** It removes the duplicated branching but leaves three hand-rolled fetch loops with different failure rules. Too little.
- **B — a `useActionableInbox()` hook owning queues, names and decisions, shared by the badge.** The bell is in every header, so it would run name hydration on every screen. That adds reads, and the badge needs counts only.
- **C — inject the loaders (ports).** No runtime boundary is crossed beyond the existing services, so it is ceremony.

The plan above is A plus the service fetch.

**Testing strategy:**
- A vitest file, `packages/shared/test/services/inboxService.actionable.test.ts` (new), tests `actionableScope` directly: super admin, village admin, org admin, all three at once, none. It tests `getActionableRequests` with services mocked at the module boundary, as `inboxService.pending.test.ts` does. That covers each failure rule and the `kinds` filter.
- The screen test keeps its 6 behaviour cases and stops checking which service a role reads, because the scope test owns that.
- `useUnreadInboxCount.test.tsx` asserts the badge reads only organizer and org-creation requests.

## Paths

- `packages/shared/src/services/inboxService.ts`
- `packages/shared/src/services/_services-map.md` (the inboxService row)
- `packages/shared/test/services/inboxService.actionable.test.ts` (new)
- `apps/mobile/app/buzon/index.tsx`
- `apps/mobile/app/buzon/__tests__/index.test.tsx`
- `apps/mobile/lib/hooks/useUnreadInboxCount.ts`
- `apps/mobile/lib/hooks/__tests__/useUnreadInboxCount.test.tsx`
- `apps/mobile/lib/inbox/useInboxNames.ts` (new)
- `docs/decisions/unified-inbox.md` (say where the scope rule lives)

## Approval

Pre-approved — "debt and refactors that change nothing observable", and "docs, plans and comments that contradict the code" (the badge hook's comment). It touches no rules, converters or stored data, so there is no hard stop.

A separate question surfaced here, and this plan does not touch it: should the badge also count join requests, open reports and cosateca requests? That changes what a user is shown and adds reads on every header focus, so it **needs your yes** and belongs in its own idea. Once this plan lands, joins and reports are a one-line change to the badge's `kinds`; cosateca would need its own watch in the hook, since it is not a `kind`.

## Out of scope

- Changing the badge's number. It stays organizer plus org-creation requests (see Approval).
- Moving the actionable queues and the activity feed from one-shot `get*` reads to `watch*` + `useWatch` (offline-first-village). It is a separate change with its own service work. Once this lands, it is a change inside `getActionableRequests`.
- `apps/mobile/app/admin/solicitudes-organizador.tsx`, which reads organizer requests with no role branching.
- Any visual change to the Buzón.
