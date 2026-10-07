import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { signOut as fbSignOut } from '@cultuvilla/shared/firebase/sdk/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { AuthProvider, SIGN_OUT_CLEANUP_TIMEOUT_MS } from '../AuthContext';
import { useAuth } from '../useAuth';
import { observability } from '@cultuvilla/shared';
import { fetchUserIdHash } from '../../observability/errorBridge';
import { signInWithCredential, signInWithCustomToken } from '@cultuvilla/shared/firebase/sdk/auth';
import { verifyAuthOtpCode } from '@cultuvilla/shared/services/authEmailService';
import { clearPendingToken } from '../otpTokenCache';
import { unregisterPushForSignOut } from '../../push/pushSession';

const FAKE_UID = 'user-raw-uid-123';
const FAKE_HASH = 'a'.repeat(64);

interface MockAuthUser {
  uid: string;
  email: string | null;
  delete?: jest.Mock;
}

let mockAuthUser: MockAuthUser | null = { uid: FAKE_UID, email: 'a@b.com' };

jest.mock('@cultuvilla/shared/firebase', () => ({
  getAuth: () => ({
    // `getAuth().currentUser` — the live source of truth the raw-uid guard
    // re-checks against before applying the hashed user context.
    get currentUser() {
      return mockAuthUser;
    },
    onAuthStateChanged: (cb: (u: unknown) => void) => {
      cb(mockAuthUser);
      return () => {};
    },
  }),
}));

jest.mock('@cultuvilla/shared/firebase/sdk/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    cb(mockAuthUser);
    return () => {};
  },
  isSignInWithEmailLink: jest.fn().mockReturnValue(false),
  signInWithEmailLink: jest.fn(),
  GoogleAuthProvider: class {
    static credential() {
      return {};
    }
  },
  OAuthProvider: class {
    credential() {
      return {};
    }
  },
  signInWithCredential: jest.fn(),
  signInWithCustomToken: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

import { getUserProfile } from '@cultuvilla/shared/services/userService';
import { clearLocalCacheAndRestart } from '../clearLocalCache';

jest.mock('../clearLocalCache', () => ({ clearLocalCacheAndRestart: jest.fn(async () => undefined) }));

jest.mock('@cultuvilla/shared/services/userService', () => ({
  getUserProfile: jest.fn().mockResolvedValue({ activeMunicipalityId: 'm1' }),
  setActiveMunicipality: jest.fn(),
  patchUserProfile: jest.fn(),
}));

jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getUserMemberships: jest.fn().mockResolvedValue([]),
}));

jest.mock('@cultuvilla/shared/services/authEmailService', () => ({
  sendAuthSignInEmail: jest.fn(),
  sendAuthOtpCode: jest.fn(),
  verifyAuthOtpCode: jest.fn(),
}));

jest.mock('@cultuvilla/shared/services/listenerManager', () => ({
  clearAll: jest.fn(),
}));

jest.mock('../../observability/errorBridge', () => ({
  fetchUserIdHash: jest.fn(),
}));

jest.mock('../../push/pushSession', () => ({
  unregisterPushForSignOut: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@cultuvilla/shared', () => ({
  observability: {
    setUserContext: jest.fn(),
  },
}));

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthUser = { uid: FAKE_UID, email: 'a@b.com', delete: jest.fn().mockResolvedValue(undefined) };
    (getUserProfile as jest.Mock).mockResolvedValue({ activeMunicipalityId: 'm1' });
  });

  it('exposes a null user before sign-in', () => {
    mockAuthUser = null;
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('never forwards the raw uid to observability.setUserContext — only the resolved hash', async () => {
    (fetchUserIdHash as jest.Mock).mockResolvedValue(FAKE_HASH);
    renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => {
      expect(observability.setUserContext).toHaveBeenCalledWith(
        expect.objectContaining({ uid: FAKE_HASH }),
      );
    });

    for (const call of (observability.setUserContext as jest.Mock).mock.calls) {
      const arg = call[0];
      if (arg !== null) {
        expect(arg.uid).not.toBe(FAKE_UID);
      }
    }
  });

  it('does not apply the resolved hash if the account changed mid-fetch', async () => {
    (fetchUserIdHash as jest.Mock).mockImplementation(async () => {
      // Simulate a sign-out/account-switch racing the hash fetch.
      mockAuthUser = { uid: 'a-different-uid', email: null };
      return FAKE_HASH;
    });
    renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => {
      expect(fetchUserIdHash).toHaveBeenCalled();
    });

    // Give the microtask queue a chance to flush the .then().
    await new Promise((r) => setTimeout(r, 0));

    for (const call of (observability.setUserContext as jest.Mock).mock.calls) {
      const arg = call[0];
      if (arg !== null) {
        expect(arg.uid).not.toBe(FAKE_UID);
      }
    }
  });
});

describe('abandonSignUp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // An earlier test leaves fetchUserIdHash reassigning mockAuthUser mid-fetch.
    (fetchUserIdHash as jest.Mock).mockResolvedValue(FAKE_HASH);
    mockAuthUser = { uid: FAKE_UID, email: 'wrong@b.com', delete: jest.fn().mockResolvedValue(undefined) };
    (getUserProfile as jest.Mock).mockResolvedValue({ activeMunicipalityId: 'm1' });
  });

  it('deletes the account when no profile doc exists yet', async () => {
    // No profile == the Auth user was created by this very sign-in
    // (verifyAuthOtpCode), so nobody else owns that address.
    (getUserProfile as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.profileChecked).toBe(true));

    const deleteFn = mockAuthUser!.delete!;
    await act(async () => {
      await result.current.abandonSignUp();
    });

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(fbSignOut).not.toHaveBeenCalled();
  });

  it('only signs out when the account already has a profile', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    const deleteFn = mockAuthUser!.delete!;
    await act(async () => {
      await result.current.abandonSignUp();
    });

    expect(deleteFn).not.toHaveBeenCalled();
    expect(fbSignOut).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain sign-out when the delete is refused', async () => {
    (getUserProfile as jest.Mock).mockResolvedValue(null);
    mockAuthUser!.delete = jest.fn().mockRejectedValue(new Error('auth/requires-recent-login'));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.profileChecked).toBe(true));

    await act(async () => {
      await result.current.abandonSignUp();
    });

    expect(fbSignOut).toHaveBeenCalledTimes(1);
  });
});

// The signup bug: `verifyAuthOtpCode` deletes the OTP inside the transaction
// that validates it, then creates the user and mints a token. So when the
// sign-in that follows dies on a flaky connection, the code is already spent
// and the account already exists — the user saw an error but was in fact
// registered, which is why signing in again worked.
describe('verifyOtpCode on a flaky connection', () => {
  const EMAIL = 'nueva@example.com';
  const networkError = () =>
    Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), {
      code: 'auth/network-request-failed',
    });

  function renderAuth() {
    return renderHook(() => useAuth(), { wrapper: AuthProvider });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingToken();
    mockAuthUser = null;
    (verifyAuthOtpCode as jest.Mock).mockResolvedValue('custom-token-1');
  });

  it('does not spend a second code when sign-in fails on the network', async () => {
    (signInWithCustomToken as jest.Mock).mockRejectedValueOnce(networkError());
    const { result } = renderAuth();

    await expect(result.current.verifyOtpCode(EMAIL, '123456')).rejects.toThrow();
    expect(verifyAuthOtpCode).toHaveBeenCalledTimes(1);

    // The retry reuses the token already minted rather than demanding a fresh
    // code the user does not have.
    (signInWithCustomToken as jest.Mock).mockResolvedValueOnce(undefined);
    await result.current.verifyOtpCode(EMAIL, '123456');

    expect(verifyAuthOtpCode).toHaveBeenCalledTimes(1);
    expect(signInWithCustomToken).toHaveBeenCalledTimes(2);
    expect((signInWithCustomToken as jest.Mock).mock.calls[1][1]).toBe('custom-token-1');
  });

  it('discards a token the server rejected, so the retry asks for a new code', async () => {
    (signInWithCustomToken as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('bad token'), { code: 'auth/invalid-custom-token' }),
    );
    const { result } = renderAuth();

    await expect(result.current.verifyOtpCode(EMAIL, '123456')).rejects.toThrow();

    (signInWithCustomToken as jest.Mock).mockResolvedValueOnce(undefined);
    (verifyAuthOtpCode as jest.Mock).mockResolvedValueOnce('custom-token-2');
    await result.current.verifyOtpCode(EMAIL, '654321');

    expect(verifyAuthOtpCode).toHaveBeenCalledTimes(2);
    expect((signInWithCustomToken as jest.Mock).mock.calls[1][1]).toBe('custom-token-2');
  });

  it('clears the token once sign-in succeeds', async () => {
    (signInWithCustomToken as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderAuth();

    await result.current.verifyOtpCode(EMAIL, '123456');
    await result.current.verifyOtpCode(EMAIL, '999999');

    // A second sign-in is a genuinely new attempt, not a retry of the first.
    expect(verifyAuthOtpCode).toHaveBeenCalledTimes(2);
  });

  it('never hands one account\'s token to a different email', async () => {
    (signInWithCustomToken as jest.Mock).mockRejectedValueOnce(networkError());
    const { result } = renderAuth();

    await expect(result.current.verifyOtpCode(EMAIL, '123456')).rejects.toThrow();

    (signInWithCustomToken as jest.Mock).mockResolvedValueOnce(undefined);
    (verifyAuthOtpCode as jest.Mock).mockResolvedValueOnce('custom-token-other');
    await result.current.verifyOtpCode('otro@example.com', '123456');

    expect(verifyAuthOtpCode).toHaveBeenCalledTimes(2);
    expect((signInWithCustomToken as jest.Mock).mock.calls[1][1]).toBe('custom-token-other');
  });
});

describe('signInWithApple', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthUser = { uid: FAKE_UID, email: 'a@b.com' };
    Platform.OS = 'ios';
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
  });

  it('rejects on any platform other than iOS', async () => {
    Platform.OS = 'android';
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await expect(result.current.signInWithApple()).rejects.toThrow(/iOS/);
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
  });

  it('signs in with the returned identityToken on iOS', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValueOnce({
      identityToken: 'apple-identity-token',
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await result.current.signInWithApple();

    expect(signInWithCredential).toHaveBeenCalledTimes(1);
  });

  it('maps a cancelled Apple sheet to a friendly error', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await expect(result.current.signInWithApple()).rejects.toThrow(/cancelled/);
  });

  it('maps a cancel that arrives with no code, as prod iOS reports it', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValueOnce(
      new Error('The user canceled the authorization attempt'),
    );
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await expect(result.current.signInWithApple()).rejects.toMatchObject({ code: 'auth/cancelled' });
  });

  it('passes a real Apple failure through untouched', async () => {
    const failure = new Error('The authorization attempt failed for an unknown reason');
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValueOnce(failure);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await expect(result.current.signInWithApple()).rejects.toBe(failure);
  });

  it('rejects when Apple returns no identityToken', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: null });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await expect(result.current.signInWithApple()).rejects.toThrow(/identityToken/);
    expect(signInWithCredential).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchUserIdHash as jest.Mock).mockResolvedValue(FAKE_HASH);
    mockAuthUser = { uid: FAKE_UID, email: 'a@b.com' };
    (getUserProfile as jest.Mock).mockResolvedValue({ activeMunicipalityId: 'm1' });
    (unregisterPushForSignOut as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('signs out of Firebase even when the push-row delete never settles', async () => {
    // The device row is deleted with a Firestore write that only resolves on a
    // backend ack. A phone whose Firestore connection has stalled must still be
    // able to sign out — the delete is best-effort, the sign-out is not.
    jest.useFakeTimers();
    (unregisterPushForSignOut as jest.Mock).mockReturnValue(new Promise<void>(() => {}));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    let settled = false;
    const signingOut = result.current.signOut().then(() => {
      settled = true;
    });
    await act(async () => {
      jest.advanceTimersByTime(SIGN_OUT_CLEANUP_TIMEOUT_MS);
    });

    await waitFor(() => expect(fbSignOut).toHaveBeenCalledTimes(1));
    await signingOut;
    expect(settled).toBe(true);
  });

  it('waits for the push-row delete when it settles promptly', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });

    expect(unregisterPushForSignOut).toHaveBeenCalledTimes(1);
    expect(fbSignOut).toHaveBeenCalledTimes(1);
    const [unregisterOrder] = (unregisterPushForSignOut as jest.Mock).mock.invocationCallOrder;
    const [signOutOrder] = (fbSignOut as jest.Mock).mock.invocationCallOrder;
    expect(unregisterOrder).toBeLessThan(signOutOrder ?? -1);
  });

  // Member-only data must not outlive the session in the on-device cache.
  it('clears the local cache only after auth has signed out', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });

    const [signOutOrder] = (fbSignOut as jest.Mock).mock.invocationCallOrder;
    const [clearOrder] = (clearLocalCacheAndRestart as jest.Mock).mock.invocationCallOrder;
    expect(signOutOrder).toBeLessThan(clearOrder ?? -1);
  });
});
