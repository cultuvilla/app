import {
  authSessionReducer,
  initialSessionState,
  isDisposableSignUp,
  profileRetryDelay,
  PROFILE_RETRY_MS,
  type Profile,
  type SessionEvent,
  type SessionState,
} from '../authSession';

type U = { uid: string };
const A: U = { uid: 'a' };
const B: U = { uid: 'b' };
const PROFILE = { id: 'a', activeMunicipalityId: 'm1' } as unknown as Profile;

function run(events: SessionEvent<U>[], from: SessionState<U> = initialSessionState<U>()) {
  return events.reduce<SessionState<U>>(authSessionReducer, from);
}

const signIn = (user: U): SessionEvent<U> => ({ type: 'authChanged', user, holdForRestore: false });
const signOut: SessionEvent<U> = { type: 'authChanged', user: null, holdForRestore: false };
const answered = (uid: string, profile: Profile): SessionEvent<U>[] => [
  { type: 'profileAnswered', uid, profile },
  { type: 'profileSettled', uid, answered: true },
];
const failed = (uid: string): SessionEvent<U> => ({ type: 'profileSettled', uid, answered: false });

describe('authSessionReducer', () => {
  it('starts loading, signed out, unchecked', () => {
    expect(initialSessionState()).toEqual({
      user: null,
      loading: true,
      profile: null,
      profileLoading: false,
      profileChecked: false,
    });
  });

  it('marks a sign-out checked, with no profile', () => {
    const s = run([signIn(A), ...answered('a', PROFILE), signOut]);
    expect(s).toMatchObject({ user: null, loading: false, profile: null, profileChecked: true });
  });

  it('holds the launch signed-out answer until the restore settles', () => {
    const held = run([{ type: 'authChanged', user: null, holdForRestore: true }]);
    expect(held).toMatchObject({ loading: true, profileChecked: false });
    const settled = authSessionReducer(held, { type: 'launchSettled', currentUid: null });
    expect(settled).toMatchObject({ loading: false, profileChecked: true });
  });

  it('leaves the profile unchecked when the restore signed someone in', () => {
    const s = run([
      { type: 'authChanged', user: null, holdForRestore: true },
      signIn(A),
      { type: 'launchSettled', currentUid: 'a' },
    ]);
    expect(s).toMatchObject({ user: A, loading: false, profileChecked: false });
  });

  it('unchecks the profile in the same transition as a sign-in after a sign-out', () => {
    const signedOut = run([signIn(A), ...answered('a', PROFILE), signOut]);
    const s = authSessionReducer(signedOut, signIn(B));
    expect(s).toMatchObject({ user: B, profile: null, profileLoading: true, profileChecked: false });
    expect(isDisposableSignUp(s, 'b')).toBe(false);
  });

  it('does not carry one account\'s profile to another', () => {
    const s = run([signIn(A), ...answered('a', PROFILE), signIn(B)]);
    expect(s.profile).toBeNull();
  });

  it('keeps the profile for a new user object of the same account', () => {
    const s = run([signIn(A), ...answered('a', PROFILE), signIn({ uid: 'a' })]);
    expect(s).toMatchObject({ profile: PROFILE, profileChecked: false, profileLoading: true });
  });

  it('ignores a repeat of the same user object', () => {
    const s = run([signIn(A), ...answered('a', PROFILE)]);
    expect(authSessionReducer(s, signIn(A))).toBe(s);
  });

  it('leaves a failed read unchecked and not disposable', () => {
    const s = run([signIn(A), { type: 'profileRequested', uid: 'a' }, failed('a')]);
    expect(s).toMatchObject({ profile: null, profileLoading: false, profileChecked: false });
    expect(isDisposableSignUp(s, 'a')).toBe(false);
  });

  it('keeps the profile checked when a refresh fails', () => {
    const s = run([signIn(A), ...answered('a', PROFILE), { type: 'profileRequested', uid: 'a' }, failed('a')]);
    expect(s).toMatchObject({ profile: PROFILE, profileChecked: true, profileLoading: false });
  });

  it('is not checked between the answer and the end of the read', () => {
    const s = run([signIn(A), { type: 'profileAnswered', uid: 'a', profile: null }]);
    expect(s.profileChecked).toBe(false);
    expect(isDisposableSignUp(s, 'a')).toBe(false);
  });

  it('ignores a late answer for another account', () => {
    const s = run([signIn(A), signOut, signIn(B), ...answered('a', null)]);
    expect(s).toMatchObject({ user: B, profileChecked: false, profileLoading: true });
    expect(isDisposableSignUp(s, 'b')).toBe(false);
  });

  it('ignores a request for another account', () => {
    const s = run([signIn(A), ...answered('a', PROFILE)]);
    expect(authSessionReducer(s, { type: 'profileRequested', uid: 'b' })).toBe(s);
  });

  it('ignores any profile event while signed out', () => {
    const s = run([signOut, { type: 'profileRequested', uid: 'a' }, ...answered('a', null)]);
    expect(s).toMatchObject({ user: null, profileLoading: false, profile: null });
  });
});

describe('isDisposableSignUp', () => {
  it('is true for an answered read of no profile', () => {
    expect(isDisposableSignUp(run([signIn(A), ...answered('a', null)]), 'a')).toBe(true);
  });

  it('is false when the account has a profile', () => {
    expect(isDisposableSignUp(run([signIn(A), ...answered('a', PROFILE)]), 'a')).toBe(false);
  });

  it('is false while the read is in flight', () => {
    expect(isDisposableSignUp(run([signIn(A)]), 'a')).toBe(false);
  });

  it('is false when Auth\'s live user is not the session\'s', () => {
    const s = run([signIn(A), ...answered('a', null)]);
    expect(isDisposableSignUp(s, 'b')).toBe(false);
    expect(isDisposableSignUp(s, null)).toBe(false);
  });

  it('is false when signed out', () => {
    expect(isDisposableSignUp(run([signOut]), null)).toBe(false);
  });
});

describe('profileRetryDelay', () => {
  it('follows the back-off and clamps to the longest wait', () => {
    expect(PROFILE_RETRY_MS.map((_, n) => profileRetryDelay(n))).toEqual([...PROFILE_RETRY_MS]);
    expect(profileRetryDelay(PROFILE_RETRY_MS.length)).toBe(30000);
    expect(profileRetryDelay(100)).toBe(30000);
    expect(profileRetryDelay(-1)).toBe(1000);
  });
});
