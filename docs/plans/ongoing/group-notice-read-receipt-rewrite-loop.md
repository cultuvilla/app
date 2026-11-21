# Group notices: stop re-writing a read receipt the rules refuse

**Priority:** medium — a client loop of denied writes (about 1 every 1.3 s while the screen is open) costs battery and writes and floods the error counts; users see nothing
**Landed:** dev
**Gate:** soak:a store version carrying #718 is live on prod; then prod client errors show no permission-denied writes on `organizations/*/messages/*/reads/*`
**Next:** once that version is live, query prod Error Reporting / Cloud Logging (read-only) for denied read-receipt writes; none → retire the plan

**Goal:** Mark each aviso read at most once per user, so an existing receipt is never written again.

## Context

Found by w18 on 2026-11-20 in ios-e2e diag run fix-5 (44785476426, commit 7ed8e2f7, flow 12, e2e-user, pid 47949). That shard showed 48 `WriteStream … Permission denied` errors between 18:40:23 and 18:41:24, every one on `organizations/e2e-org-asociacion/messages/lRfElXPF0nWCMNstWXNV/reads/e2e-user`. The rules logged "evaluation error at L2224:28 for 'create', false for 'update'". The receipt already existed (the flow asserted `readAt` present at 18:40:15), and receipts are write-once by design.

`apps/mobile/components/feature/groups/GroupNotices.tsx` retries on purpose: on a failed write it removes the id from `marked`, and its effect re-runs on every notices/readIds change. So some mounted `useGroupNotices` instance (`apps/mobile/lib/orgs/useGroupNotices.ts`; also used by `grupos.tsx`, `aviso/[aviso].tsx`, `TransparentAvisos.tsx`) had `readIds` without that message while the receipt existed. Which instance it was, and why its reads watch missed the doc, is not yet known.

## Design

First find why the instance's `readIds` misses an existing receipt: a watch scoped to the wrong query, a second instance with its own stale state, or a race with the create. Then make the mark idempotent at the client: a permission-denied on an existing receipt counts as "already read" and is never retried. Keep the retry for transient errors only. Don't loosen the rule; write-once is intended.

**Alternatives considered:** allowing `update` in the rules (hides the client bug and makes receipts mutable); a backoff on retries (still loops).

**Testing strategy:** a unit test for the mark logic (denied on an existing receipt → no retry); a rules test is already implied by write-once; check the ios-e2e flow 12 stream-error count drops to about 0.

## Paths

`apps/mobile/components/feature/groups/GroupNotices.tsx`, `apps/mobile/lib/orgs/useGroupNotices.ts`, the notices read service in `packages/shared/src/services/`, their tests.

## Approval

Pre-approved — "fixing a defect whose correct behaviour is not in dispute". Users see nothing different. The groups screens are being edited live on develop (2026-11-20), so check for in-flight work there before starting.

## Out of scope

Changing the receipt rule or the unread-dot UI.

## Dev soak (2026-11-21)

Passed: three ios-e2e develop runs (A, B and C = 44901678360 on 7d114713) showed 0 denied writes on the read receipt in every shard that uploaded artifacts.
