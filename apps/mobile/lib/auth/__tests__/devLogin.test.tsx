import { act, renderHook, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { signInWithEmailAndPassword } from '@cultuvilla/shared/firebase/sdk/auth';
import { AuthProvider } from '../AuthContext';
import { useAuth } from '../useAuth';

const VECINO = 'demo-vecino@cultuvilla.dev';
const ADMIN = 'demo-admin@cultuvilla.dev';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock('@cultuvilla/shared/firebase', () => ({
  getAuth: () => ({ currentUser: null }),
}));

jest.mock('@cultuvilla/shared/firebase/sdk/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    cb(null);
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
  signInWithEmailAndPassword: jest.fn().mockResolvedValue(undefined),
  signOut: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../clearLocalCache', () => ({ clearLocalCacheAndRestart: jest.fn(async () => undefined) }));
jest.mock('@cultuvilla/shared/services/userService', () => ({
  getUserProfile: jest.fn().mockResolvedValue(null),
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
jest.mock('@cultuvilla/shared/services/listenerManager', () => ({ clearAll: jest.fn() }));
jest.mock('../../observability/errorBridge', () => ({ fetchUserIdHash: jest.fn() }));
jest.mock('../../push/pushSession', () => ({
  unregisterPushForSignOut: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared', () => ({ observability: { setUserContext: jest.fn() } }));

const extra = (Constants.expoConfig as { extra: Record<string, unknown> }).extra;

describe('dev login accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    extra['devLogin'] = { emails: [VECINO, ADMIN], password: 'pw' };
  });

  // The app used to sign itself into the dev account on every launch, which
  // fought the user: "Cerrar sesión" was undone by the reload that follows it.
  it('never signs in on its own at launch', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.user).toBeNull();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('exposes the configured accounts', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.devAccounts).toEqual([VECINO, ADMIN]);
  });

  it('signs into a chosen account with the shared dev password', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      await result.current.signInWithDevAccount(ADMIN);
    });
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), ADMIN, 'pw');
  });

  it('refuses an account that is not configured', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await expect(result.current.signInWithDevAccount('someone@else.com')).rejects.toThrow();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('offers no accounts when the build carries no dev login', async () => {
    extra['devLogin'] = null;
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.devAccounts).toEqual([]);
  });
});
