import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInWithCustomToken } from '@cultuvilla/shared/firebase/sdk/auth';
import { restoreLegacySession as requestRestore } from '@cultuvilla/shared/services/authSessionService';
import { discardLegacySession, restoreLegacySession } from '../legacySession';

let mockCurrentUser: { uid: string } | null = null;

jest.mock('@cultuvilla/shared/firebase', () => ({
  getAuth: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
  }),
}));
jest.mock('@cultuvilla/shared/firebase/sdk/auth', () => ({ signInWithCustomToken: jest.fn() }));
jest.mock('@cultuvilla/shared/services/authSessionService', () => ({
  restoreLegacySession: jest.fn(),
}));

const KEY = 'firebase:authUser:the-api-key:[DEFAULT]';
const ENTRY = JSON.stringify({ uid: 'u1', stsTokenManager: { refreshToken: 'the-refresh-token' } });

describe('legacySession', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('cultuvilla.other', 'kept');
    mockCurrentUser = null;
    jest.mocked(requestRestore).mockReset();
    jest.mocked(signInWithCustomToken).mockReset();
  });

  it('asks nothing when the phone holds no old session', async () => {
    await restoreLegacySession();

    expect(requestRestore).not.toHaveBeenCalled();
  });

  it('signs in with the restored token and deletes the old session', async () => {
    await AsyncStorage.setItem(KEY, ENTRY);
    jest.mocked(requestRestore).mockResolvedValue({ status: 'restored', token: 'custom' });

    await restoreLegacySession();

    expect(requestRestore).toHaveBeenCalledWith('the-refresh-token', 'the-api-key');
    expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), 'custom');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await AsyncStorage.getItem('cultuvilla.other')).toBe('kept');
  });

  it('deletes a refused session without signing in', async () => {
    await AsyncStorage.setItem(KEY, ENTRY);
    jest.mocked(requestRestore).mockResolvedValue({ status: 'refused' });

    await restoreLegacySession();

    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('keeps the old session for the next launch when the request fails', async () => {
    await AsyncStorage.setItem(KEY, ENTRY);
    jest.mocked(requestRestore).mockRejectedValue(new Error('offline'));

    await expect(restoreLegacySession()).rejects.toThrow('offline');

    expect(await AsyncStorage.getItem(KEY)).toBe(ENTRY);
  });

  it('keeps the old session for the next launch when the sign-in fails', async () => {
    await AsyncStorage.setItem(KEY, ENTRY);
    jest.mocked(requestRestore).mockResolvedValue({ status: 'restored', token: 'custom' });
    jest.mocked(signInWithCustomToken).mockRejectedValue(new Error('network'));

    await expect(restoreLegacySession()).rejects.toThrow('network');

    expect(await AsyncStorage.getItem(KEY)).toBe(ENTRY);
  });

  it('never replaces a session the user started while the request was in flight', async () => {
    await AsyncStorage.setItem(KEY, ENTRY);
    jest.mocked(requestRestore).mockImplementation(async () => {
      mockCurrentUser = { uid: 'signed-in-by-hand' };
      return { status: 'restored', token: 'custom' };
    });

    await restoreLegacySession();

    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('drops an entry it cannot read without calling the server', async () => {
    await AsyncStorage.setItem(KEY, 'not json');

    await restoreLegacySession();

    expect(requestRestore).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('discardLegacySession removes only the old session', async () => {
    await AsyncStorage.setItem(KEY, ENTRY);

    await discardLegacySession();

    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await AsyncStorage.getItem('cultuvilla.other')).toBe('kept');
  });
});
