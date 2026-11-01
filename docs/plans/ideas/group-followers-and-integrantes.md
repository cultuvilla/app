# Seguidores and integrantes of a group

**Priority:** medium

Decided 2026-11-01 (user): becoming a member of any group needs an admin's
acceptance. There is no instant self-join any more. The seguidor tier is the
direction; its open questions are below.

## Problem

The app has one way to be tied to a group, the miembro
(`organizations/{orgId}/members/{uid}`). In a group with a socio roster (peña,
asociación, otros, and soon comisión), `syncOrgSocioRoster` makes every miembro a
socio: an alta in the libro de socios, and someone who owes the cuota. In an `open`
group, the default, that takes one tap, so "I like this peña" and "I belong to this
peña" are the same action. Only the junta should write in the libro de socios.

The copy shows the confusion. The group home's stats row shows "Socios" and
"Miembros" side by side, and nothing tells a user how they differ: miembros are the
socios who have the app, and socios also include personas a cargo and people
without the app.

## Decisions

- **Every membership is admitted.** Joining is always a join request
  (`organizations/{orgId}/joinRequests/{uid}`, resolved by
  `respondToOrgJoinRequest`). Admins (org, village, app) can still add people
  directly, as they can today.
- **`joinPolicy` goes away.** With one way in, `isVettedOrgMember(org)` becomes
  simply "member", so every group may hold private events. The switch-to-open
  warning and its copy go too. This simplifies
  [org-join-policy.md](../../decisions/org-join-policy.md), which has to be
  rewritten when this ships.
- **Two tiers, as users see them:**

  | | Seguidor | Integrante |
  |---|---|---|
  | How | A free tap, no approval | Join request, accepted by an admin |
  | Gets | The group's public events and public avisos | Everything: tasks, private events, actas, cuota |
  | Libro de socios | No | Yes, as today (`member` row) |
  | Count | "N seguidores" | "N integrantes" |

  "Miembro" leaves the copy; "integrante" replaces it. Code names stay as they are
  (`members/`, `socios/`, `role: 'admin' | 'member'`).

## Rollout (installed clients)

Installed binaries self-join an `open` group with a direct write to `members/`.
Tightening the member-create rule makes that write fail on those binaries, which
is client-breaking (see
[breaking-change-and-hard-wall.md](../../decisions/breaking-change-and-hard-wall.md)).

1. **Expand:** new clients always file a join request, whatever `joinPolicy` says,
   and the request create rule and the callable accept requests for `open` groups.
   The edit screen stops offering the switch. Ships by OTA.
2. **Contract:** the owner branch of the member-create rule goes, `joinPolicy` is
   dropped from the model and the rules, and `privateEventAccess.ts` drops the
   check. This release carries `Breaking-Client:` and raises `minSupported` to
   step 1's version. Dropping a field is a `post-deploy` cleanup backfill.

## Open questions

1. **Existing members of open groups.** They joined unvetted, and once
   `joinPolicy` goes they would see private events. *My pick:* keep them as
   integrantes. They are already in the libro de socios, and the admins can give
   a baja to anyone they don't recognise. The alternative is demoting them to
   seguidores, which writes bajas into every open group's libro.
2. **Where seguidores live.** *My pick:* a separate
   `organizations/{orgId}/followers/{uid}` subcollection, so following never
   touches `members/`, its rules or the roster trigger. Notifying followers of new
   events and avisos is a new trigger, which adds running cost and needs a yes.
3. **Ayuntamiento.** *My pick:* vecinos follow; integrantes are the ayuntamiento's
   team. It has no socio roster, so nothing changes there.
4. **Does a pending request make you a follower?** *My pick:* yes. Asking to join
   follows the group, so the requester sees its public life while they wait.
5. **Sequencing.** The [comisión plan](../ready/comision-de-festejos-type.md) is
   gated on the uncommitted group work in the develop checkout. This one also
   edits `firestore.rules`, the group screens and `es.json`, so start it after
   both land.

## Touch points

- `OrganizationDataModel.ts` (`joinPolicy`), `OrgJoinRequestDataModel.ts`,
  `orgJoinRequestService.ts`, `organizationService.ts`
- `firestore.rules`: org member create (owner branch), join request create,
  `isVettedOrgMember`, org create/update `joinPolicy` checks
- `functions/src/organizations/respondToOrgJoinRequest.ts`,
  `functions/src/helpers/privateEventAccess.ts`
- Mobile: org detail join FAB and leave copy (`entidad/[entidad]/index.tsx`),
  edit screen (`editar.tsx`), `crear/evento.tsx`, `grupos.tsx`,
  `GroupSectionBody.tsx`, the group stats row
- `packages/i18n/messages/es.json`: miembro → integrante, seguidor copy
- `docs/decisions/org-join-policy.md`, `docs/business-rules.md`
