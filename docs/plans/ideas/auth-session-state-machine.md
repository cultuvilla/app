# Auth session state as a pure reducer

**Priority:** medium — two fixes in one day (2026-10-10) on the profile-load state that decides whether `abandonSignUp` deletes an account

**Goal:** Move `AuthProvider`'s user/profile session state (five `useState` flags, the stale-read guard and the "disposable sign-up" rule) into a pure, directly tested reducer, so the state that gates a destructive account delete changes in one place, atomically, and is tested without mounting the provider.

## Context

As of `83d0b039` (origin/develop, 2026-10-16). `apps/mobile/lib/auth/AuthContext.tsx` is 674 lines, churn 19 with 11 fix commits in the 90-day window — the highest fix ratio among the hot files. It is the one file exempt from the service-layer invariant (AGENTS.md §1), so it also owns Firebase Auth directly.

Not all of that churn is in the code this plan touches. Of the recent auth fix commits:

- `03ccd6f9` fix(auth): stop dev auto sign-in undoing "Cerrar sesión" and `fab0f369` fix(auth): keep the sign-out's own auth flip from consuming the skip marker fixed the dev auto sign-in, which `b3051b77` deleted the same day (replaced by one-tap dev login buttons). They are history, not current risk.
- `9400484d` fix(auth): stop reporting a cancelled Apple sheet as an error is already a pure helper (`isAppleCancellation`).
- `f43f7d8a` fix(auth): never take a failed profile read for a missing profile and `e41804d5` fix(auth): drop a profile read that answers after its account signed out (both 2026-10-10) are the live problem. Both are about one state: the triple `user / profile / profileChecked`. The first let a failed read leave the profile null and checked; the second let an old account's late "no profile" land in a new account's state. Each time, `AuthGate` (`apps/mobile/app/_layout.tsx`) routed a signed-in user to `/(onboarding)/completar-perfil`, and `abandonSignUp` treats exactly that state (`profileChecked && profile === null`) as an account created by this very sign-in, and deletes it.

Today that state is spread across `AuthProvider`:

- five `useState` flags (`user`, `loading`, `profile`, `profileLoading`, `profileChecked`), set from three places: the `onAuthStateChanged` effect, the profile-load effect (with its `PROFILE_RETRY_MS` back-off) and `loadProfile` (its body and its `finally`), which `refreshProfile` also calls;
- the stale-read guard, a closure `current()` inside `loadProfile` that re-reads `getAuth().currentUser?.uid`;
- the disposable rule, an inline expression inside `abandonSignUp`.

The listener sets `user` and, on sign-out, `profileChecked = true`; the effect that resets `profileChecked = false` for a new user runs one commit later. So for one commit after a sign-in that follows a sign-out in the same JS session (a guest who signs in, or a sign-in after `abandonSignUp`, which does not reload the app the way `signOut` does), the context exposes `user = B, profileChecked = true, profile = null` — the triple `resolveAuthRoute` (`apps/mobile/lib/auth/authRoute.ts`) reads as "needs onboarding". Whether a `<Redirect>` (expo-router runs it in `useFocusEffect`, i.e. a child effect that fires before the provider's) actually navigates in that commit is **unverified**; the first test of the build pins it.

The existing `apps/mobile/lib/auth/__tests__/AuthContext.test.tsx` (485 lines) does drive real sequences — an account switch mid-read with a hand-held promise, a failing read then a retry — but only through `renderHook` over the whole provider with every Firebase and service module mocked, `waitFor` timing, and the retry test waiting on the real 1 s back-off. Routing is already pure and tested (`authRoute.ts`); the session state that feeds it is not.

## Design

A new pure module, `apps/mobile/lib/auth/authSession.ts`, owns the session state and its transitions; `AuthProvider` keeps every side effect (listener, reads, retries, sign-out, delete) and only dispatches.

Illustrative, not final:

```ts
type SessionState = {
  status: 'resolving' | 'signedOut' | 'signedIn';
  uid: string | null;
  profile: Profile;
  profilePhase: 'idle' | 'loading' | 'answered' | 'failed';
};
type SessionEvent =
  | { type: 'authChanged'; uid: string | null }
  | { type: 'profileRequested'; uid: string }
  | { type: 'profileAnswered'; uid: string; profile: Profile }
  | { type: 'profileFailed'; uid: string };

export function authSessionReducer(s: SessionState, e: SessionEvent): SessionState;
export function isDisposableSignUp(s: SessionState): boolean; // signedIn && answered && profile === null
export function profileRetryDelay(attempt: number): number;  // PROFILE_RETRY_MS, clamped
```

- `authChanged` resets the profile phase in the **same** transition that sets the uid, so the "new user, old checked flag" commit cannot exist.
- Every profile event carries its uid; the reducer drops one whose uid is not the session's. That is today's `current()` guard as a rule, not a closure. The provider keeps the `getAuth().currentUser` re-check for the hashed-uid analytics stamp, which is a side effect, not state.
- The context value is derived from state, so `loading`, `profileLoading` and `profileChecked` keep their names and meanings for `AuthGate`, `PushProvider`, `mi-pueblo.tsx` and `resolveIntentResume`. No consumer changes.
- `abandonSignUp` reads `isDisposableSignUp(state)` instead of its inline expression.
- Provider adapters (Google, Apple, OTP, change-email/re-auth, the E2E fixture-login seam, dev login) and `teardownSession` stay as they are: they are linear async calls with no shared state, and splitting them is a separate, cosmetic move.

**Alternatives considered:**
- *A full state machine over all of auth, sign-in providers included (e.g. XState).* Lost: a new dependency for flows that are linear async functions; the races live only in the session state.
- *A `useProfileSession(user)` hook with an injected profile-read port.* Lost: moves the same `useState` tangle into a second file and still needs `renderHook` to test; the tests already mock at the service boundary.
- *Leave it — the two fixes are in and tested.* Lost narrowly: the state that gates a destructive delete would stay set from three places, and the next fix would again be found by an E2E run under load (as `f43f7d8a` was).

**Testing strategy:** a new `apps/mobile/lib/auth/__tests__/authSession.test.ts` covers the transitions directly, no mocks or timers: sign-out → checked with no profile; sign-in after a sign-out → unchecked in the same transition; a failed read → not checked, not disposable; a late answer for another uid → ignored; an answer of `null` → disposable; an answer with a profile → not disposable; retry delays clamp. First, write the "sign-in after sign-out in one session" sequence against today's provider to learn whether the stale commit reaches `AuthGate`; record the result in the PR. Then in `AuthContext.test.tsx`, replace the state assertions in the `a failed profile read` cases ("leaves the profile unchecked", and the `profileChecked` half of "ignores a read that answers after its account is no longer signed in", which also asserts `abandonSignUp` does not delete) with the reducer tests, and keep one wiring test each for retry-then-load and for `abandonSignUp` deleting / not deleting. The OTP, Apple, sign-out and hashed-uid tests stay unchanged.

## Paths

As of 2026-10-17:

- `apps/mobile/lib/auth/AuthContext.tsx`
- `apps/mobile/lib/auth/authSession.ts` (new)
- `apps/mobile/lib/auth/__tests__/authSession.test.ts` (new)
- `apps/mobile/lib/auth/__tests__/AuthContext.test.tsx`

## Approval

Pre-approved — "debt and refactors that change nothing observable". Every behaviour the current tests pin is kept, and the context's shape and meanings are unchanged. If the first test shows the stale sign-in commit does reach `AuthGate`, closing it is also pre-approved — "fixing a defect whose correct behaviour is not in dispute": a returning user is never meant to be routed to onboarding.

## Out of scope

- Splitting the sign-in provider adapters or change-email/re-auth out of `AuthContext.tsx`.
- Any change to `resolveAuthRoute`, `resolveIntentResume` or what `AuthGate` renders.
- The OTP token cache (`otpTokenCache.ts`) and the sign-out teardown order, both already fixed and tested.
- The native-SDK auth seam (`packages/shared/src/firebase/sdk/`), already built as layer 1 of `docs/plans/ongoing/offline-first-village.md`.
