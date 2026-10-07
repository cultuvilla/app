import { renderHook, waitFor } from '@testing-library/react-native';
import { useOwnerSummary } from '../useOwnerSummary';
import { useFirestoreDoc } from '@cultuvilla/shared/hooks';
import { DELETED_USER_UID } from '@cultuvilla/shared/models/user';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { userDoc } from '@cultuvilla/shared/firebase/refs/client';

jest.mock('../i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => (key === 'settings.deletedUser' ? 'Usuario eliminado' : key) }),
}));

// useOwnerSummary passes the signed-in viewer to getPersonByUserId so a caller's
// own private persona still resolves; the hook now requires an auth context.
jest.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'viewer-9' } }),
}));

jest.mock('@cultuvilla/shared/hooks', () => ({
  useFirestoreDoc: jest.fn(),
}));

jest.mock('@cultuvilla/shared/firebase', () => ({
  getDb: jest.fn(),
}));

jest.mock('@cultuvilla/shared/firebase/refs/client', () => ({
  userDoc: jest.fn(),
  publicProfileDoc: jest.fn((_db: unknown, uid: string) => ({ path: `publicProfiles/${uid}` })),
  personDoc: jest.fn(),
  organizationDoc: jest.fn(),
}));

jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: jest.fn().mockResolvedValue(null),
}));

const mockUseFirestoreDoc = useFirestoreDoc as jest.Mock;

describe('useOwnerSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFirestoreDoc.mockReturnValue({ data: undefined, loading: false, error: null });
  });

  it('short-circuits the deleted-user sentinel to the localized label with no avatar', () => {
    const { result } = renderHook(() => useOwnerSummary(DELETED_USER_UID, 'user'));

    expect(result.current).toEqual({
      name: 'Usuario eliminado',
      imageUri: null,
      loading: false,
    });
    // Never subscribes to the (nonexistent) users/deleted-user doc.
    expect(mockUseFirestoreDoc).toHaveBeenCalledWith(null);
  });

  it('reads another user through publicProfiles, never the owner-only users doc', () => {
    // users/{uid} is readable only by its owner or an app admin, so subscribing
    // to it for anyone else is denied and the chip rendered a bare "+" avatar
    // with no name (event organizers, news bylines). The fake mirrors the rules:
    // only the public projection yields data.
    mockUseFirestoreDoc.mockImplementation((ref: { path?: string } | null) =>
      ref?.path === 'publicProfiles/user-1'
        ? { data: { displayName: 'Ana García', activeMunicipalityId: null }, loading: false, error: null }
        : { data: undefined, loading: false, error: { code: 'permission-denied' } },
    );
    (userDoc as jest.Mock).mockImplementation((_db: unknown, uid: string) => ({ path: `users/${uid}` }));

    const { result } = renderHook(() => useOwnerSummary('user-1', 'user'));

    expect(result.current.name).toBe('Ana García');
  });

  it("takes a user's avatar from their linked persona", async () => {
    mockUseFirestoreDoc.mockReturnValue({
      data: { displayName: 'Ana García', activeMunicipalityId: null },
      loading: false,
      error: null,
    });
    (getPersonByUserId as jest.Mock).mockResolvedValueOnce({ photoURL: 'https://img/ana.jpg' });

    const { result } = renderHook(() => useOwnerSummary('user-1', 'user'));

    await waitFor(() => expect(result.current.imageUri).toBe('https://img/ana.jpg'));
  });

  it('passes the signed-in viewer to the persona lookup', async () => {
    mockUseFirestoreDoc.mockReturnValue({
      data: { displayName: 'Ana García', photoURL: null },
      loading: false,
      error: null,
    });

    renderHook(() => useOwnerSummary('user-1', 'user'));

    // Without the viewer the rules reject the query outright for a private
    // persona, which is what emptied the pickers.
    await waitFor(() => {
      expect(getPersonByUserId).toHaveBeenCalledWith('user-1', 'viewer-9');
    });
  });
});
