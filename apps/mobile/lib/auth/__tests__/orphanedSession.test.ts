import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  checkRestoredSession,
  orphanedVerdictOf,
  rememberOrphanedNotice,
  takeOrphanedNotice,
} from '../orphanedSession';

const withCode = (code: string) => Object.assign(new Error(code), { code });

describe('orphanedVerdictOf', () => {
  it.each([
    ['auth/user-not-found', 'accountGone'],
    ['auth/user-disabled', 'accountGone'],
    ['auth/user-token-expired', 'sessionExpired'],
    ['user-not-found', 'accountGone'],
  ])('reads %s as %s', (code, reason) => {
    expect(orphanedVerdictOf(withCode(code))?.reason).toBe(reason);
  });

  it.each(['auth/network-request-failed', 'auth/invalid-user-token', 'auth/internal-error', 'auth/constructor'])(
    'keeps the session on %s',
    (code) => {
      expect(orphanedVerdictOf(withCode(code))).toBeNull();
    },
  );

  it('keeps the session on an error with no code', () => {
    expect(orphanedVerdictOf(new Error('boom'))).toBeNull();
    expect(orphanedVerdictOf(null)).toBeNull();
  });
});

describe('checkRestoredSession', () => {
  it('force-refreshes the token and keeps a session that refreshes', async () => {
    const getIdToken = jest.fn().mockResolvedValue('token');
    await expect(checkRestoredSession({ getIdToken })).resolves.toBeNull();
    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it('answers the verdict instead of rejecting', async () => {
    const getIdToken = jest.fn().mockRejectedValue(withCode('auth/user-disabled'));
    await expect(checkRestoredSession({ getIdToken })).resolves.toEqual({
      code: 'user-disabled',
      reason: 'accountGone',
    });
  });
});

describe('the notice across the restart', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is shown once', async () => {
    await rememberOrphanedNotice('sessionExpired');
    await expect(takeOrphanedNotice()).resolves.toBe('sessionExpired');
    await expect(takeOrphanedNotice()).resolves.toBeNull();
  });

  it('drops a value it does not know', async () => {
    await AsyncStorage.setItem('cultuvilla.orphanedSessionNotice', 'something');
    await expect(takeOrphanedNotice()).resolves.toBeNull();
    expect(await AsyncStorage.getItem('cultuvilla.orphanedSessionNotice')).toBeNull();
  });
});
