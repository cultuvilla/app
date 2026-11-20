import type { UserData } from '@cultuvilla/shared/models/user';

export type Profile = (UserData & { id: string }) | null;

/**
 * The signed-in session as AuthProvider exposes it. `loading`, `profileLoading`
 * and `profileChecked` keep the meanings every consumer reads (AuthGate,
 * PushProvider, resolveAuthRoute): `profileChecked` means "the profile read for
 * this user answered", never "it failed".
 */
export interface SessionState<U extends { uid: string }> {
  user: U | null;
  loading: boolean;
  profile: Profile;
  profileLoading: boolean;
  profileChecked: boolean;
}

export type SessionEvent<U extends { uid: string }> =
  /**
   * The auth listener answered. `holdForRestore` is set on the launch's first
   * signed-out answer, while a pre-native session may still be restored: the
   * session stays loading until `launchSettled`.
   */
  | { type: 'authChanged'; user: U | null; holdForRestore: boolean }
  /** The launch's restore attempt settled; `currentUid` is Auth's live user. */
  | { type: 'launchSettled'; currentUid: string | null }
  | { type: 'profileRequested'; uid: string }
  | { type: 'profileAnswered'; uid: string; profile: Profile }
  /** The read finished; `answered` is false when it failed. */
  | { type: 'profileSettled'; uid: string; answered: boolean };

export function initialSessionState<U extends { uid: string }>(): SessionState<U> {
  return { user: null, loading: true, profile: null, profileLoading: false, profileChecked: false };
}

export function authSessionReducer<U extends { uid: string }>(
  state: SessionState<U>,
  event: SessionEvent<U>,
): SessionState<U> {
  switch (event.type) {
    case 'authChanged': {
      const { user } = event;
      if (user === state.user) return state;
      if (user) {
        // The new user's profile is unchecked in the same transition that sets
        // it: a sign-in after a sign-out must never expose "signed in, checked,
        // no profile" — AuthGate's onboarding state, which abandonSignUp
        // deletes as a fresh sign-up.
        return {
          user,
          loading: false,
          profile: state.user?.uid === user.uid ? state.profile : null,
          profileLoading: true,
          profileChecked: false,
        };
      }
      if (event.holdForRestore) {
        return { ...state, user: null, profile: null, profileLoading: false };
      }
      return { user: null, loading: false, profile: null, profileLoading: false, profileChecked: true };
    }
    case 'launchSettled': {
      const signedOut = event.currentUid === null && state.user === null;
      return { ...state, loading: false, profileChecked: signedOut ? true : state.profileChecked };
    }
    case 'profileRequested':
      if (!isFor(state, event.uid)) return state;
      return { ...state, profileLoading: true };
    case 'profileAnswered':
      if (!isFor(state, event.uid)) return state;
      return { ...state, profile: event.profile };
    case 'profileSettled':
      if (!isFor(state, event.uid)) return state;
      return {
        ...state,
        profileLoading: false,
        profileChecked: event.answered ? true : state.profileChecked,
      };
  }
}

/** A profile event for an account that is no longer the session's touches nothing. */
function isFor<U extends { uid: string }>(state: SessionState<U>, uid: string): boolean {
  return state.user?.uid === uid;
}

/**
 * True when the signed-in account has no profile doc, by an answered read: an
 * account created by this very sign-in, which abandonSignUp deletes. Every
 * other state — a read in flight, a failed read, an account other than Auth's
 * live user — must answer false, or a real account is deleted.
 */
export function isDisposableSignUp<U extends { uid: string }>(
  state: SessionState<U>,
  currentUid: string | null,
): boolean {
  return (
    currentUid !== null &&
    state.user?.uid === currentUid &&
    state.profileChecked &&
    state.profile === null
  );
}

/** Back-off between attempts at a profile read that failed at sign-in. */
export const PROFILE_RETRY_MS = [1000, 2000, 5000, 10000, 30000] as const;
const LONGEST_RETRY_MS = 30000;

/** The wait before retry number `attempt + 1`, clamped to the longest back-off. */
export function profileRetryDelay(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), PROFILE_RETRY_MS.length - 1);
  return PROFILE_RETRY_MS[index] ?? LONGEST_RETRY_MS;
}
