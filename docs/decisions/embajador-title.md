# Embajador: the public title of a pueblo

The person who looks after a pueblo in the app is its **Embajador** (or
**Embajadora**) **de Cultuvilla**. It is a public title with one holder per
pueblo, and a team with the same permissions stands behind them. This is a
presentation layer over the existing membership model: no identifiers were
renamed.

## Problem

The role was called "Administrador" in the app and "organizador" in the backend
copy. Neither word gives anyone a reason to take the job on. The business is
recruiting people to look after their pueblo through an explicit campaign
("buscamos embajadores de Cultuvilla"), so the role has to read as something to
be proud of. Before this change it was nearly invisible: a grey caption on *Mis
pueblos* was the only place it appeared.

## Decision

1. **One Embajador per pueblo. That person is `community.organizerId`.** The
   single-holder pointer already existed, so no new "ambassador" field was
   added. A title held by exactly one person is scarce, and that scarcity is
   what makes it prestigious: "el Embajador de Matabuena", not "uno de cinco".
2. **Every other admin is "Equipo del pueblo".** They have the same permissions
   and no title. Authority is still the `role` flag, as described in
   [membership-roles-and-audit.md](membership-roles-and-audit.md). The title is
   pure presentation, computed by `villageTitle()`. A bigger pueblo needs more
   hands, and one person alone is a single point of failure.
3. **The title is gendered from the person's `sex`.** `female` shows
   "Embajadora". Everything else shows "Embajador", because Spanish has no
   neutral form. The Embajador's person doc is often private, so their `sex` is
   copied onto `community.organizerSex`. It lives there and not on the public
   `users/{uid}` doc, because putting it on the user doc would expose every
   user's sex rather than only the Embajador's, whose public title reveals it
   anyway. It is kept in sync by `syncPersonDenormalization` and the functions
   that move the pointer. See
   [denormalized-read-models.md](../architecture/denormalized-read-models.md).
4. **The title can be handed over.** `transferVillageAmbassador` lets the
   current Embajador, or an app admin, move the title to another member, who
   becomes admin if they were not already. The outgoing Embajador stays on the
   team. Before this callable existed, a pueblo whose Embajador stepped back was
   stuck, because `changeVillageMemberRole` refuses to demote the pointer's
   holder.
5. **The title is visible where it counts:**
   - a soft "Embajador/Embajadora en {pueblo}" line under the name on their
     profile;
   - a small Cultuvilla seal on the Embajador's photo — in the members list
     (where it is the only mark: the team keeps its badge) and on the profile;
   - a one-time "¡Ya eres Embajador!" sheet with a share button;
   - a gendered approval notification.

   The request screen shows the applicant their own carnet — face, name, title
   and escudo — so they see that the role is public before they apply.

   The village home no longer carries a card for the Embajador (removed
   2026-10-06, user's call): the pueblo's page is about the pueblo, and the
   seal already marks the Embajador wherever their face appears.

## Not done, on purpose

- **No rename of `role: 'admin'`, `organizerId` or `organizerRequests`.** The
  admin role is the permission level that villages and organizations share. A
  title is marketing and can change after a future campaign without touching
  data. The code already separates internal names from what users see in the
  same way, with municipality versus village.
- **Generic copy stays masculine.** Text addressed to the viewer before they
  hold the title ("Quiero ser embajador") uses the generic masculine. Only a
  title that names a specific person is gendered.
