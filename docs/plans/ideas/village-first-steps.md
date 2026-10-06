# Village first steps — from "started" to "alive"

**Priority:** medium

**Goal:** make the path for a new pueblo *find it → "Es mi pueblo" → post one
thing → share the link*, with the Embajador as something that emerges from
activity rather than a prompt in the way of it.

## Context

The question that prompted this was "a village isn't activated until it has an
admin/Embajador — should we let people post before that?" The answer is that
**they already can**, and it hasn't helped:

- Since [self-service-membership](../../decisions/self-service-membership.md),
  activation, membership and the Embajador are independent. `startVillage`
  activates a dormant municipality with `organizerId: null` (wiki phase) and
  joins the caller; anyone can then self-join.
- Posting is member-gated, not admin-gated: `events`, `news`, `historyEntries`
  and `festivalPosters` all allow create on `isVillageMember(municipalityId)`
  (`firestore.rules`).

Prod on 2026-09-29 (read-only query over every `communityActive` municipality):

| | Villages | Members | Events | News | Orgs | Embajador requests |
|---|---|---|---|---|---|---|
| Matabuena (has an Embajador) | 1 | 178 | 26 | 4 | 12 | 1 |
| All other active villages (wiki phase) | 20 | 0–2 each | 0 | 0 | 0 | 0 |

Twenty villages were started and every one stalled at its starter. Nobody was
blocked from posting — they didn't post. Several are clearly curiosity starts
(Madrid, Barcelona, Segovia, Logroño, Fuencarral). Matabuena worked because a
real person brought the people and the peñas, not because of the flow.

So the problem is not a missing permission. It is that the flow, once a
village is started, points the lone starter at *the wrong next action*.

**Already done (2026-10-06):** start is folded into join. The "Iniciar pueblo"
screen and its Embajador toggle are gone; a dormant pueblo opens its village
home with a join button, and `ensureVillageMembership` starts it on the first
join. What a dormant pueblo shows is still an invitation, not an empty village
home.

## Remaining friction (as of 2026-09-29)

1. **The wiki-phase village home leads with the Embajador ask.** The first
   thing under the header is "Este pueblo aún no tiene embajador…" + "Quiero ser
   embajador" (`VillageHomeBody.tsx`, `noOrganizer` block). For a village with one
   member and no content it asks for commitment before anything exists to care
   for.
2. **Peñas/asociaciones wait on a superadmin in the wiki phase.** Orgs are
   created `status: 'pending'`; approval (`approveOrganization`) needs a village
   admin or superadmin, and a wiki-phase village has no admin. It is the one
   place where the missing Embajador genuinely blocks content — and it is
   inconsistent with the optimistic-visibility model events/news already use
   ([content-moderation-optimistic-visibility](../../decisions/content-moderation-optimistic-visibility.md)).
3. **After starting, nothing guides the first post.** The village is empty
   sections; no "crea el primer evento", no "compártelo en el grupo de WhatsApp
   del pueblo".

## Proposal

1. **Move the Embajador prompt down.** Show "Quiero ser embajador" below the
   content sections, and only once the village has some traction (threshold TBD
   — see open questions). The request itself (`requestOrganizeVillage`) is
   unchanged.
2. **Orgs visible immediately in the wiki phase.** Create peñas/asociaciones
   `active` when the village has no Embajador (or always), with reporting +
   `setContentVisibility` as the backstop, matching events/news. Ayuntamiento
   stays a callable-gated singleton. **Touches `firestore.rules` → hard-stop
   list, separate PR, never self-merges.**
3. **First-post empty state.** When a village has no events and no news, the
   village home leads with one card: create the first event / news item, and a
   share button that sends the village link (`getVillageViewLink`) to WhatsApp.
   After a starter's first post, offer the same share.

Order: 1 + 3 in one mobile PR, 2 in its own rules PR.

## Open questions

- **Threshold for the Embajador prompt.** N members? First post? Never shown
  automatically, only from the village menu? Recommendation: after the village's
  first post or third member, whichever comes first.
- **Orgs: optimistic always, or only while there is no Embajador?** Always is
  simpler and consistent with events/news; wiki-phase-only keeps the Embajador's
  approval role where one exists.
- **Curiosity starts.** Folding start into join makes activation even cheaper, so
  expect more Madrid/Barcelona-style one-member villages. Does anything read
  `communityActive` as a quality signal (Explora ranking, counts in the panel,
  store claims) that should switch to "has content" instead?
- **Does a dormant pueblo need anything to render?** The village home currently
  assumes `community != null` for the active branch; an empty-but-dormant render
  must not trip the strict converter or the web read routes
  ([web-is-a-read-site](../../decisions/web-is-a-read-site.md)).
- **Measurement.** Which observability events tell us whether this worked —
  e.g. time from `village_start` to first post, share taps from the empty state?
- **The human side.** The data suggests the bigger lever is outreach (the
  fiestas-timed approach in the business repo), not the flow. This plan removes
  friction; it won't by itself make a pueblo come alive.
