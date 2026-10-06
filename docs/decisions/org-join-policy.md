# Organization join policy: open or by approval

An organization (peña, asociación, …) chooses how people become members:
**`open`**, anyone joins on the spot, which was the only behaviour until now;
or **`approval`**, people ask and an org admin admits them. Only `approval` orgs
may hold private events.

## Problem

Private events (`visibility: 'organization'`) are gated on membership of the
organizing org, so that membership has to mean something: the org must decide
who is in it. With self-service joining as the only mode, it didn't.

## Decision

- **`organizations.joinPolicy: 'open' | 'approval'`**, default `open`. The org
  admins switch it in the org settings. The model defaults it on read because
  installed binaries still create orgs without it (the rules accept that);
  existing docs are backfilled explicitly (`scripts/backfill-org-join-policy.mjs`:
  orgs already holding a private event become `approval`, so their members keep
  access; the rest `open`).
- **Self-join only into `open` orgs.** The org-member create rule's owner branch
  requires `joinPolicy == 'open'`; admins (org, village, app) can still add
  anyone directly.
- **`approval` orgs take join requests** at
  `organizations/{orgId}/joinRequests/{uid}`, one per requester. The requester
  files and withdraws it (rules check the shape, that the org is approved and
  `approval`, and that they are not already a member). No client edits it: the
  **`respondToOrgJoinRequest`** callable resolves it, with the same authority as
  the member-create rule. It adds the member and its `membershipEvents` record
  in the transaction that deletes the request, then notifies the requester
  (`org_join_request_approved` / `_rejected`). The **`onOrgJoinRequestCreated`**
  trigger tells the org's admins (`org_join_request_created`). Pending requests
  show on the org page for whoever manages it and in the Buzón of the org's
  admins; the requester sees theirs as a sent request.
- **Private events need an admitted membership.** `isVettedOrgMember(org)` =
  member **and** the org is `approval`. It gates creating a private event,
  moving an event into an org, reading one, and seeing its roster, and
  `assertMayJoinEvent` applies the same check to sign-ups (which the Admin SDK
  writes past the rules). Organizers of the event and app admins keep access.
- **Switching back to `open` fails closed.** The org's private events stop being
  readable by its members until it requires approval again, rather than
  becoming reachable by anyone who walks in. The settings screen warns before
  the switch.

## Rejected

- **A per-member "confirmed" flag** with open joining left untouched: less
  surface, but two classes of member in one org is harder to explain than a
  single rule about how the org admits people.
- **Admin-only private events**: smallest change, but it turns a members'
  feature into an admins' one.
- **Blocking the switch to `open` while private events exist**: rules cannot
  query for them, and a client-side check is not a guarantee.
