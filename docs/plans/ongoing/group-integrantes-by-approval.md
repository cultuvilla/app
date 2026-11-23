# How someone becomes an integrante

**Priority:** medium
**Landed:** dev
**Gate:** soak:the first release carrying this is live in prod
**Next:** check on prod that `org-join-by-approval` ran and that a group's switch works, then retire this plan

Decided 2026-11-01 (user): every group starts out requiring an admin's acceptance, its
admin may open it, the ayuntamiento never opens, and any group may hold private events.
The rationale that outlives this plan is in
[org-join-policy.md](../../decisions/org-join-policy.md).

## What shipped

The switch, join requests, the rename to *integrante*, and private events in any group.
Seguidores were built too and removed the same day, before leaving dev: see the decision
record.

**No wall.** Every binary above `minSupported` (1.10.0) already understands both values,
so `org-join-by-approval` moves them by data alone. `joinPolicy` stays for good, so
there is no contract step.

## Decided

- Existing members of open groups stay integrantes.
- Existing groups all start on `approval`, once; an admin who wants it open switches it back.
