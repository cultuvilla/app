# Sign-in account loss — release the fix and audit prod

**Priority:** high — live-user data integrity: prod can still delete a signed-in user's Auth account
**Landed:** dev
**Gate:** release:1.11.0
**Next:** 1.11.0 (with `f43f7d8a`) is on beta since 2026-10-23 but not on prod (prod serves 1.10.0); once it is live on prod, re-run the audit below on prod and beta, record it, and retire

## Goal

Ship the fix for the sign-in path that deletes real accounts, and confirm in the release
that no user other than the one already restored lost their account.

## Context

On 2026-10-22 a prod user signing in with Google was sent to "Completa tu perfil" even
though their profile existed. Their `users/{uid}` doc was intact, but the Auth user with
that uid had been deleted; Google sign-in then minted a fresh uid with no profile.

The cause is the bug fixed on develop by `f43f7d8a` ("never take a failed profile read
for a missing profile"), which is not on `beta` or `main` as of 1.10.0:

1. `loadProfile` set `profileChecked` in a `finally`, so a profile read that **failed**
   (bad network, slow start) left `profile === null` and checked.
2. `AuthGate` routed the signed-in user to `completar-perfil`.
3. Leaving that screen calls `abandonSignUp`, which takes that state for an account
   created by this very sign-in and **deletes the Auth user** — leaving the profile and
   every uid-keyed doc behind as orphans.

The same user's replacement Auth account was deleted the same way while we investigated,
which confirms the path.

**Recovery used:** recreate the Auth user under the original uid with `importUsers`
(email, `emailVerified: true`, and the `google.com` provider entry with the same Google
subject id). The next Google sign-in lands on the original uid, so no data migration is
needed. Delete any empty replacement Auth user first, or the email/provider conflicts.

## Audit — done 2026-10-22 (pre-release)

Read-only, Admin SDK, prod and beta:

- **Profiles without an Auth user** (`users/*` whose id is not in `listUsers`): prod 1 —
  the account above, now restored; beta 0.
- **uids referenced in data but absent from Auth**: every top-level collection's
  `createdBy` / `userId` / `uid` / `authorId`, every `members` subcollection doc id, and
  every `registrations` `userId` / `createdBy`. Prod 0 after the restore.
- **Auth users without a profile**: prod 46 (2 Firebase Test Lab bots), beta 25. These
  are unfinished sign-ups, not losses — nothing was deleted — but see Out of scope.

Blind spot: an account deleted on its very first sign-in, before any profile existed,
leaves no trace. It also loses nothing.

## Interim audit — 2026-11-07 (prod still on 1.10.0)

Read-only, Admin SDK. **Profiles without an Auth user: prod 0, beta 0** — no new
loss since the restore. Prod has two `users/{uid}` paths with no profile doc and no
Auth user, each holding only a `devices` doc (created 2026-10-18 and 2026-11-02):
sign-ups deleted before a profile existed, the blind spot above. They lose nothing;
the stale device docs are harmless leftovers.

## Tasks

- [x] Restore the affected prod account under its original uid
- [x] Pre-release audit on prod and beta (above)
- [x] Cut 1.11.0 — on `beta` and its OTA channel since 2026-10-23; the beta → main promotion has not happened (the Android beta build of 2026-10-23 failed on the EAS free plan's monthly Android build limit, so no `beta → main` PR opened)
- [ ] Confirm the fix is in the build each env serves (OTA `production` channel on main)
- [ ] Re-run both audit checks on prod and beta after the release; any new orphan profile
      means a loss between today and the release → restore it the same way and note it here
- [ ] Retire this plan once prod is verified (no decision doc needed — the commit message
      of `f43f7d8a` carries the why)

## Rollout status

| Step | Dev | Beta | Prod |
|---|---|---|---|
| Fix deployed (`f43f7d8a`) | ✅ | ✅ 1.11.0, 2026-10-23 | ⬜ |
| Post-release audit clean | — | ⬜ | ⬜ |

Legend: ⬜ pending · ⏳ in progress · ✅ done · ⚠️ blocked (note inline)

## Out of scope

- The sign-up drop-off (46 of 295 prod Auth users never completed a profile) is a funnel
  question, not this bug. Worth its own idea if it matters.
- Clients on binaries older than the OTA fingerprint keep the bug until they update.
