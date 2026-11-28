# Groups present in several pueblos

**Priority:** medium
**Landed:** none
**Gate:** soak:the first release carrying this is live in prod
**Next:** once merged, witness docs/qa/pending/multi-village-groups.md on dev; after the release, check on prod that `org-municipality-ids` ran and every approved group still shows in its own pueblo, then retire this plan

Decided 2026-11-28 (Álvaro): a group is one group (one junta, one cuota, one Charla)
that may be listed in other pueblos — not local branches under a parent group — with
the picks of that day: another pueblo lists it only once its Equipo accepts, that
Equipo's only power over it is taking it out again, the cosateca "para todo el
pueblo" stays with the home, and the home never moves. The rationale that outlives
this plan is in [multi-village-groups.md](../../decisions/multi-village-groups.md).

## What shipped

- `organizations.municipalityIds` (home included, function-owned), the
  `presenceRequests` subcollection, `respondToOrgPresenceRequest`,
  `removeOrgPresence`, `onOrgPresenceRequestCreated`.
- Village lists, the organizer picker, mentions, the studio and the read site list a
  pueblo's groups by `municipalityIds`.
- App: «Pueblos» in a group's Ajustes, the Buzón row for the asked Equipo, «De X» on
  a visiting group's card, «De X · También en Y» on its page.
- Backfill `org-municipality-ids` (pre-deploy, autoApply on every env).
