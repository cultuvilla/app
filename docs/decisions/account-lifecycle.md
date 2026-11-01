# Account lifecycle: change email + delete account

Cultuvilla auth is **passwordless** (Google OAuth + email magic-link only), so
neither "forgot password" recovery nor a password-based delete confirmation is
available — the two account-lifecycle actions had to be designed around that.

## Change email

`verifyBeforeUpdateEmail` only changes the Firebase Auth email once the user
clicks the confirmation link mailed to the **new** address; Firestore
`users/{uid}.email` is then synced from `onAuthStateChanged` on next resume,
not written eagerly. Firebase forces `requires-recent-login` for this call, and
since there's no password, re-auth is a **second magic-link round-trip to the
current email** (a distinct `AsyncStorage` intent, separate from sign-in, so
the two flows don't collide if both are pending).

`firestore.rules` cross-checks `request.resource.data.email ==
request.auth.token.email` on any `users` update that touches `email` — without
it, a client could write an arbitrary unverified email onto their own profile
doc.

Google-linked accounts can't change email through Firebase Auth at all — the
row is disabled with a hint to change it via the linked Google account, rather
than attempting an unsupported flow.

## Delete account

**Policy: anonymize, don't purge.** Personal data (profile, memberships,
registrations, dependent personas the user created) is hard-deleted; content
they authored for the community (news, events) is **kept** and reattributed to
the `DELETED_USER_UID` sentinel (`packages/shared/src/models/user/deletedUser.ts`),
rendered as "Usuario eliminado". This is the RGPD-compliant balance for a
community app: personal data must go, but a village's published history
shouldn't disappear because one contributor left. Free text with no editorial
value is hard-deleted instead: comments and group chat messages (leaving a group
keeps a member's chat messages under their name; erasing the account does not).

**Sole-admin block.** `checkAccountDeletable` refuses deletion (surfacing the
blocking villages/orgs) if the user is the only admin anywhere — deleting them
would leave that group leaderless. This required adding `userId` to
`OrgMemberDataModel` (it already existed on `VillageMemberDataModel`), since
the sole-admin check is a `collectionGroup('members').where('userId','==',uid)`
query and org members had no such field before this change.

**Delete needs no re-auth.** Unlike change-email, `deleteAccount` runs
server-side via the Admin SDK, which bypasses Firebase's `requires-recent-login`
check entirely. The confirmation gate is a client-side typed "ELIMINAR" prompt,
not a Firebase re-auth round-trip — proportionate to the passwordless
constraints without a second magic-link detour for an already-authenticated,
already-consequential action.

`deleteAccount` re-runs the sole-admin check server-side before deleting
(the client-side preview is not trusted), batches deletes in chunks of ≤500,
and preserves `membershipEvents/` (the append-only audit log survives its
subject's departure by design) while emitting `removed` events for each
membership it deletes.

## Revisit when

If a delete-account flow is ever needed for orgs/villages themselves (not just
users), the anonymize-vs-purge question and the sole-admin block logic in
`functions/src/account/blockers.ts` are the pieces to generalize first.
