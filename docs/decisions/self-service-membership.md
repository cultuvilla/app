# Self-service membership: decoupled belong / start / organize

Organizing a village no longer *activates* it — activation, membership, and admin
are three independent acts (see the Decision). This supersedes the earlier model
in which an organizer request both created the community and appointed its admin.

## Problem

Joining a village was gated by an organizer: a user filed a `joinRequest`, a
village admin approved it, and only then did membership exist. This bottlenecked
growth, felt like gatekeeping ("belonging to your own village shouldn't need
permission"), and left dormant villages unjoinable because the *only* way to make
one joinable was to take on the full organizer burden.

A second knot: "organizing" bundled two unrelated things — bringing a village
into existence (activation) and becoming the person who runs it (admin).

## Decision

Three independent layers replace the single "organize" act:

1. **Belong (self-join).** Any authenticated user adds themselves as `role: user`
   to a village with an **active community**, no approval. A lean confirmation
   makes clear it's a self-declaration ("este es mi pueblo"), not verified
   residency. Enforced in **Firestore rules** (owner-only, active community,
   `role: user`, no `trustedNewsAuthor`); `create` semantics handle "already a
   member". The request-and-approve flow (`joinRequests`, `requestJoinVillage`,
   `respondToJoinRequest`, and their screens) is **retired**.

2. **Start (activation).** `startVillage` lets any user activate a dormant
   municipality — creates `community` with `adminUserId: null`,
   `communityActive: true`, and joins them as the first member. Activation no
   longer requires an organizer or superadmin approval.

3. **Organize (admin).** While `community.adminUserId == null` (the *wiki phase*),
   any member edits basic info via `updateVillageInfo`. To become organizer, a
   member of an active, organizer-less village requests it (`requestOrganizeVillage`,
   motivation only); a superadmin approves (`respondToOrganizerRequest`), which
   **grants** admin on the existing community (sets `adminUserId`, promotes to
   `role: admin`) — it no longer creates the community.

## Key points

- `community.adminUserId` is now **nullable** (started, no organizer yet).
- Membership and activation are direct/callable writes without approval; only the
  organizer grant remains superadmin-gated.
- Admins keep **expel**; there is **no blocklist** (an expelled user can re-join).
- The "organizer hook" is a contextual **no-organizer banner** on the village tab
  (with pending-request state), rather than gating places/peñas — those are not
  organizer-gated in the current rules.
- Predicates rules can't express (member AND no-organizer-yet) live in the
  `updateVillageInfo` callable; the simple self-join guard lives in rules.
- **Joining an organization (peña/asociación) is instant self-service when the
  org is `open`** — a direct client write of `organizations/{orgId}/members/{uid}`
  (role `member`), mirroring village join. An org may instead require approval;
  see [org-join-policy.md](./org-join-policy.md).
