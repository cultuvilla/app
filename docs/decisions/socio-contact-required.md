# A group can require its socios' contact data

Decided 2026-11-01 (user).

A group's admin may require the phone, the email or both (`socioPhoneRequired`,
`socioEmailRequired` on the org). There is one phone and one email: the account's,
the same phone an event sign-up asks for. Nobody retypes them, and they are not
shown again when accepting; only a value the account lacks is asked for, once.

`socioPrivate` remains the record admins read, because `users/{uid}` is private to
its owner. It holds a copy of the account's values, and `syncPublicProfile` carries
a change to every group where the value is already shared.

- **Joining:** the notice comes before the join, and accepting it is what lets
  `syncOrgSocioRoster` open the row with the data. A join request filed before the
  admin turned the switch on gets no notice at that point: the trigger still shares.
- **Already a socio:** `GroupContactGate` holds them out of the group's screens until
  they accept or leave. It is a screen, not a rule: reads are not blocked server-side.
- **Admins** are not held, or the one who turned it on could not turn it off.
- **Rules** refuse a member's write that withholds a required value.

The notice is what tells people their data is shared. Its wording has not had legal
review.

## Who controls a group's socio data

Decided 2026-11-20 (Álvaro): each group is the data controller of its socios' data
and Cultuvilla processes it on the group's behalf.

- **Typed socios.** Adding someone with no account asks the admin to confirm that
  person agreed to the group keeping their data (`TypedSocioSheet`); saving waits
  for the tick. Nothing records the confirmation: the row exists only because it
  was given. Correcting an existing row does not ask again.
- **Account deletion.** `deleteAccount` keeps every socio row the user had (name,
  number, alta, baja, cuotas: the libro is the group's record) and clears `phone`
  and `email` in each `socioPrivate`. The baja comes from the membership delete,
  through `syncOrgSocioRoster`. The query needs the `socios.uid` collection-group
  override in `firestore.indexes.json`.
