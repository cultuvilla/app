# Seguidores and integrantes of a group

**Priority:** medium
**Landed:** none
**Gate:** soak:`minSupported` has passed the first release carrying this
**Next:** the contract commit: drop `joinPolicy` from the model, `isValidOrganizationCreate`, the org update rule and `approveOrganization`, plus a `post-deploy` cleanup backfill

Decided 2026-11-01 (user): becoming a member of any group needs an admin's acceptance;
all the picks below taken with "go with the design". The rationale that outlives this
plan is in [org-join-policy.md](../../decisions/org-join-policy.md).

## What shipped

Join requests for every group, following, the rename to *integrante*, and private
events in any group.

**The rollout got simpler than the idea's two breaking steps.** Every binary above
`minSupported` (1.10.0) already understands `approval`, so the `org-join-by-approval`
backfill moves them to the request flow by data alone. No `Breaking-Client:`, no wall.
Only dropping the field is left, and that waits for the wall to pass this release.

## Decided

- Existing members of open groups stay integrantes.
- Followers live at `organizations/{orgId}/followers/{uid}`.
- The ayuntamiento works the same: vecinos follow, its team are the integrantes.
- A join request follows the group, and being turned away keeps the follow.

## Not built

- **Avisos for seguidores.** The idea said seguidores would get "public avisos", but
  avisos have no public kind: the audiences are all socios, junta, cuota and event.
  Adding one widens a stored enum under installed binaries' strict converter, so it is
  its own expand/contract, and whether the junta should reach seguidores at all needs
  a yes.
- **A list of the groups I follow.** A seguidor finds the state on the group's page
  and hears through notifications. The Grupos tab stays for integrantes.
