# Restoring pre-native sessions

Decided 2026-11-01 (user).

**Why.** Up to v1.5 the JS SDK kept the session in AsyncStorage. From the native
SDK build on, Auth reads its own native storage, and nothing moved the session
across, so updating signs a user out once. On 2026-11-01, 247 of the 269 prod
accounts created before that build had not yet signed in again, and `minSupported`
1.10.0 forces each of them through that update when they next open the app.

**How.** The old entry survives the update, since the native SDK neither reads nor
clears it. On a launch with no native user, `apps/mobile/lib/auth/legacySession.ts`
sends its refresh token to the `restoreLegacySession` callable, which verifies it
with Firebase and mints a custom token, the only way to give the native SDK a
session. The entry is deleted once answered, and on any launch with a native user.

**Decisions that are not obvious.**

- *The refresh token, not an ID token.* A custom token is a new long-lived session.
  An ID token lasts an hour and goes to every backend, so it must not be enough to
  mint one. A refresh token holder already has the session.
- *An account that has signed in since is refused.* It reached the native SDK and
  may have signed out there, and signing out must stay final. The cost is that a
  second phone on an old version signs in by hand.
- *A failed request keeps the entry*, so a phone offline at its first launch after
  updating still recovers on a later one.

**Known edge.** If someone else signed in and out on the phone before this shipped,
the entry still belongs to the original account, and that account is restored.

**Retire it** once no account can still hold a pre-native session worth restoring:
remove `legacySession.ts`, keeping a cleanup of the key for phones that still hold
a refresh token, then contract the callable. Prod logs show use under
`jsonPayload.handler="restoreLegacySession"`.
