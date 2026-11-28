# A group in several pueblos

A peña, asociación or "otros" group may be listed in pueblos besides its own: a
comarca association, a band or a sports club with members across several villages
is still **one group** — one junta, one cuota, one Charla.

Decided 2026-11-28 (Álvaro): shape A — one group present in several pueblos — and not
local branches under a parent group.

## Decision

- **A group has one home pueblo (its sede): `organizations.municipalityId`.** It never
  changes, and everything that hung off the group's pueblo stays with the home: the
  link (`/<home>/entidad/…`), the audit log, who may create the group, whose Equipo
  backs up its admins in the rules (`isVillageAdmin(orgMunicipalityId(…))`), its
  cosateca "para todo el pueblo", and its notifications.
- **`organizations.municipalityIds` lists every pueblo it is in, home included.** A
  pueblo's group list, the event organizer picker, mentions, the studio and the read
  site's village page all query it (`array-contains` + `status == approved`). A pending
  or rejected group only exists at home, so those queries keep `municipalityId`.
- **`municipalityIds` is function-owned.** A client may create a group listed in its
  home alone (installed binaries omit the field: the converter defaults it to `[]`,
  and `approveOrganization` writes `[home]`), and may never change it after.
- **Another pueblo lists a group only once its Equipo accepts.** A group admin files
  `organizations/{orgId}/presenceRequests/{municipalityId}`; the rules require an
  approved peña/asociación/otros, a pueblo with a community, and one that does not list
  it yet. `onOrgPresenceRequestCreated` tells that pueblo's Equipo; they answer in the
  Buzón through `respondToOrgPresenceRequest`, which adds the pueblo and deletes the
  request in one transaction, then tells the group's admins.
- **The other pueblo's Equipo gains one power: taking the group out again**
  (`removeOrgPresence`, which the group's admins and app admins may call too). It does
  not back up the group's admins, see its join requests or edit it.
- **An ayuntamiento and a comisión de festejos belong to one pueblo** and cannot ask;
  a group listed elsewhere cannot become a comisión until it leaves those pueblos.
- **Leaving is quiet.** `removeOrgPresence` notifies nobody and writes no audit
  event: it changes where a group is listed, not who belongs to it.
- **Installed binaries older than this** list a pueblo's groups by `municipalityId`
  (they never see visiting groups) and have no Buzón row to answer a request, so the
  notice tells an Equipo to update the app.
- **The backfill runs twice**, before the deploy (`org-municipality-ids`, which the new
  list query needs) and after it (`org-municipality-ids-after-deploy`), for a group the
  old `approveOrganization` approved in between.
- **A group from elsewhere is labelled "De <home>"** on its card, opens under its home
  link, and its page says "De X · También en Y, Z" (app and read site).

## Notifications without new types

A new `NotificationType` would make every installed binary's converter throw on the
notice. So the request rides on `org_join_request_created` and the answer on
`org_approved` / `org_rejected`, each carrying the group as its entity, which every
binary already opens.

## Considered and not done

- **Branches with a `parentOrgId`.** Separate groups with their own juntas already work
  today, one per pueblo; nothing asked for a link between them.
- **A cosateca "para todo el pueblo" reaching every pueblo the group is in.** It reaches
  the home only. Widening it means a `municipalityIds` on each cosa, synced like the
  audience already is (`syncCosaAudience`).
- **Moving a group's home.** It would move its link and its authority; a separate step
  if it is ever needed.

## What this binds

- A new query for "a pueblo's groups" filters `municipalityIds`, never `municipalityId`,
  unless it means "groups based here" (creation queue, ayuntamiento cap, ranking).
- Authority over a group comes from its home, never from `municipalityIds`.
