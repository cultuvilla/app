# How someone belongs to an organization: seguidor or integrante

A group has two tiers. A **seguidor** follows it with a free tap. An **integrante**
is a member, and only an admin makes one. There is no instant self-join.

## Problem

An organization used to choose between `open`, where anyone joined on the spot, and
`approval`. In a group with a socio roster, `syncOrgSocioRoster` makes every member a
socio, so in an `open` group, the default, one tap wrote someone into the libro de
socios and made them owe the cuota: "I like this peña" and "I belong to this peña"
were the same action. The membership of an `open` group also vetted nobody, so private
events had to be limited to `approval` groups. Decided 2026-11-01 (user): joining needs
an admin's acceptance.

## Decision

- **Every membership is admitted.** The member-create rule has no self-join branch:
  org admins, village admins and app admins add someone directly, and everyone else
  files a join request at `organizations/{orgId}/joinRequests/{uid}`, one per
  requester. No client edits a request: the **`respondToOrgJoinRequest`** callable
  resolves it, adding the member and its `membershipEvents` record in the transaction
  that deletes the request, then notifies the requester. **`onOrgJoinRequestCreated`**
  tells the org's admins. Pending requests show on the org page for whoever manages it
  and in the Buzón of the org's admins.
- **Private events need membership, nothing else.** Any group may hold them.
  `assertMayJoinEvent` applies the same check to sign-ups, which the Admin SDK writes
  past the rules. Organizers of the event and app admins keep access.
- **Following lives apart from membership**, at
  `organizations/{orgId}/followers/{uid}`, so it never touches `members/`, its rules or
  the roster trigger. Who follows is private (the follower, org, village and app
  admins); the pueblo sees `organizations.followerCount`, kept by
  `syncOrgFollowerCount`. A group's new public events reach its followers through the
  village broadcast (`onEventPublished`), with the same notification id, so a follower
  who is also a village member hears once.
- **Asking follows.** `onOrgJoinRequestCreated` follows the group for the requester,
  so they see its public life while they wait, and they keep following if they are
  turned away. An approval removes the follow: an integrante already has more.
- **The ayuntamiento works the same.** Vecinos follow it; its team are the integrantes.
  It has no socio roster, so nothing else changes.
- **Existing members stayed.** The backfill that closed the open groups removed nobody;
  they were already in the libro, and an admin can give a baja to anyone they don't
  recognise.

## `joinPolicy` is a leftover for installed binaries

Nothing reads `organizations.joinPolicy` any more, except binaries older than the
release that stopped. Those offer an instant join on `open` and treat a missing value
as `open`, so the field is kept at `approval`:

- `org-join-by-approval` moved every org to it before the rules changed. Every binary
  above `minSupported` (1.10.0 at the time; the field shipped in 1.7.1) then files a
  request, which is why this needed neither a wall nor a `Breaking-Client:` trailer.
- `approveOrganization` writes it, since those binaries still create orgs as `open`.
- The update rule refuses a move to `open`. An old binary's admin who flips its switch
  gets a failed save until the OTA reaches them, which beats an org whose join button
  fails for every old binary.

Dropping the field is a later *contract* commit, once `minSupported` has passed the
release that stopped reading it.

## Rejected

- **A per-member "confirmed" flag** with open joining left untouched: less surface, but
  two classes of member in one org is harder to explain than one way in.
- **Admin-only private events**: smallest change, but it turns a members' feature into
  an admins' one.
- **Demoting the members of open groups to seguidores**: writes a baja for each of them
  into the libro of every open group, for people nobody questioned.
- **A count aggregate instead of `followerCount`**: it needs list access to `followers/`,
  which would make who follows public.
