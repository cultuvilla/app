import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from '@cultuvilla/shared/firebase/sdk/auth';
import { AuthProvider } from '../AuthContext';
import { useAuth } from '../useAuth';
import { clearLocalCacheAndRestart } from '../clearLocalCache';

const DEV_ACCOUNT = { email: 'demo-vecino@cultuvilla.dev', password: 'pw' };

interface MockAuthUser {
  uid: string;
  email: string | null;
  delete?: jest.Mock;
}

let mockAuthUser: MockAuthUser | null = null;
// Live auth-state subscribers, so a mocked sign-out flips `user` to null in the
// mounted provider exactly as the real SDK does before the app reloads.
const mockAuthListeners: ((u: unknown) => void)[] = [];

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { devAutoLogin: { email: 'demo-vecino@cultuvilla.dev', password: 'pw' } } } },
}));

jest.mock('@cultuvilla/shared/firebase', () => ({
  getAuth: () => ({
    get currentUser() {
      return mockAuthUser;
    },
  }),
}));

jest.mock('@cultuvilla/shared/firebase/sdk/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    mockAuthListeners.push(cb);
    cb(mockAuthUser);
    return () => {
      mockAuthListeners.splice(mockAuthListeners.indexOf(cb), 1);
    };
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
  signInWithEmailAndPassword: jest.fn().mockResolvedValue(undefined),
  signOut: jest.fn(async () => {
    mockAuthUser = null;
    mockAuthListeners.forEach((cb) => cb(null));
  }),
}));

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
  fetchUserIdHash: jest.fn().mockResolvedValue('a'.repeat(64)),
}));

jest.mock('../../push/pushSession', () => ({
  unregisterPushForSignOut: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@cultuvilla/shared', () => ({
  observability: { setUserContext: jest.fn() },
}));

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** A cold JS start (app launch, or the reload sign-out triggers) with no session. */
async function bootSignedOut(): Promise<void> {
  mockAuthUser = null;
  const { unmount } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await settle();
  unmount();
}

describe('dev auto sign-in', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthListeners.length = 0;
    await AsyncStorage.clear();
  });

  it('signs into the configured dev account on a signed-out launch', async () => {
    await bootSignedOut();
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      DEV_ACCOUNT.email,
      DEV_ACCOUNT.password,
    );
  });

  async function signOutFromSignedInLaunch(): Promise<void> {
    mockAuthUser = { uid: 'u1', email: DEV_ACCOUNT.email };
    const { result, unmount } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    await act(async () => {
      await result.current.signOut();
    });
    // The auth flip lands in the still-mounted provider before the reload.
    await settle();
    expect(result.current.user).toBeNull();
    expect(fbSignOut).toHaveBeenCalledTimes(1);
    expect(clearLocalCacheAndRestart).toHaveBeenCalledTimes(1);
    unmount();
  }

  // Sign-out wipes the Firestore cache and reloads the JS app, which used to
  // reset the attempt-once ref and sign the user straight back in — "Cerrar
  // sesión" looked like it did nothing in dev builds.
  it('does not sign back in, before or after the reload that follows "Cerrar sesión"', async () => {
    await signOutFromSignedInLaunch();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();

    await bootSignedOut();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('resumes auto sign-in on the next manual reload after a sign-out', async () => {
    await signOutFromSignedInLaunch();
    await bootSignedOut();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();

    await bootSignedOut();
    expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
  });

  it('does not sign back in after abandoning a sign-up', async () => {
    mockAuthUser = { uid: 'u1', email: DEV_ACCOUNT.email };
    const { result, unmount } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    await act(async () => {
      await result.current.abandonSignUp();
    });
    await settle();

    expect(result.current.user).toBeNull();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    unmount();
  });
});
