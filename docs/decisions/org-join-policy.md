# How someone becomes an integrante of a group

An **integrante** is a member of a group. Each group's admin picks how someone becomes
one: by asking, which is where every group starts, or on the spot.

## Problem

Joining used to default to `open`, with a switch nobody had reason to look for. In a
group with a socio roster, `syncOrgSocioRoster` makes every member a socio, so one tap
wrote someone into the libro de socios and made them owe the cuota: "I like this peña"
and "I belong to this peña" were the same action. So on 2026-11-01 (user) joining came
to need an admin's acceptance everywhere, and the same day that became the default
rather than the only way: some groups do want anyone to walk in, and that call is
their admin's.

## Decision

- **`organizations.joinPolicy` is the admin's choice**, a switch on the group's edit
  screen. It warns before opening, because in an open group one tap puts someone in
  the libro and lets them read the chat, the tasks and the private events.
- **`approval` is where a group starts.** `approveOrganization` writes it, since
  installed binaries still create orgs as `open`. A doc with no value means `approval`
  to the rules and the converter.
- **On `approval`,** org admins, village admins and app admins add someone directly,
  and everyone else files a join request at `organizations/{orgId}/joinRequests/{uid}`,
  one per requester. No client edits a request: the **`respondToOrgJoinRequest`**
  callable resolves it, adding the member and its `membershipEvents` record in the
  transaction that deletes the request, then notifies the requester.
  **`onOrgJoinRequestCreated`** tells the org's admins. Pending requests show on the org
  page for whoever manages it and in the Buzón of the org's admins.
- **On `open`,** the member-create rule lets a user add themselves to an approved group,
  and refuses new requests. A request filed before the switch stays visible to admins;
  its requester may join straight away, which withdraws it.
- **The ayuntamiento never opens.** Its integrantes are its team. The update rule
  refuses it and the app hides the switch.
- **Any group may hold private events, open or not.** Decided 2026-11-01 (user): an
  admin who opens a group has been told who that lets in, and hiding its private events
  on top of that wasn't worth a rule. `assertMayJoinEvent` applies the same membership
  check to sign-ups, which the Admin SDK writes past the rules. Organizers of the event
  and app admins keep access.
- **Every group started on `approval`, once.** Most were `open` only because that was
  the default, so `org-join-by-approval` moved them all and removed nobody. It has a
  marker, so it never undoes an admin's later choice. An admin who had chosen `open`
  switches it back.

## Installed binaries

Every binary above `minSupported` (1.10.0; the field shipped in 1.7.1) honours both
values and has the switch, so this took neither a wall nor a `Breaking-Client:` trailer.
Two differences remain until they update: they hide an open group's private events from
its integrantes and won't create one there, and an ayuntamiento admin who flips their
switch gets a failed save.

## Rejected

- **Requests only, no choice.** What shipped first to dev: simpler, but it decides for
  every group that wants its door open.
- **Private events only in groups that require acceptance.** The rule before this: see
  above.
- **A per-member "confirmed" flag** with open joining left untouched: two classes of
  member in one org is harder to explain than one way in at a time.
- **Admin-only private events**: smallest change, but it turns a members' feature into
  an admins' one.
- **Demoting the members of open groups to a lighter tier**: writes a baja for each of
  them into the libro of every open group, for people nobody questioned.
- **A seguidor tier, a free tap to follow a group.** Built and removed on 2026-11-01
  (user) before it left dev: every member of a pueblo already hears about every public
  event there, so a follow only changed anything for someone outside the pueblo, at the
  cost of a third way to relate to a group.
