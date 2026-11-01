# Integrantes of a group, by approval

**Priority:** medium
**Landed:** dev
**Gate:** soak:`minSupported` has passed the first release carrying this
**Next:** the contract commit: drop `joinPolicy` from the model, `isValidOrganizationCreate`, the org update rule and `approveOrganization`, plus a `post-deploy` cleanup backfill

Decided 2026-11-01 (user): becoming a member of any group needs an admin's acceptance;
all the picks below taken with "go with the design". The rationale that outlives this
plan is in [org-join-policy.md](../../decisions/org-join-policy.md).

## What shipped

Join requests for every group, the rename to *integrante*, and private events in any
group. Seguidores were built too and removed the same day, before leaving dev: see the
decision record.

**The rollout got simpler than the idea's two breaking steps.** Every binary above
`minSupported` (1.10.0) already understands `approval`, so the `org-join-by-approval`
backfill moves them to the request flow by data alone. No `Breaking-Client:`, no wall.
Only dropping the field is left, and that waits for the wall to pass this release.

## Decided

- Existing members of open groups stay integrantes.
- The ayuntamiento works the same: its team are the integrantes.
