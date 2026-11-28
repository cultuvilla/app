import { renderHook, waitFor } from '@testing-library/react-native';
import { isAppAdmin } from '@cultuvilla/shared/services/adminService';
import { useIsAppAdmin } from '../useIsAppAdmin';

jest.mock('@cultuvilla/shared/services/adminService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/adminService')>('@cultuvilla/shared/services/adminService'),
);
const mockIsAppAdmin = jest.mocked(isAppAdmin);

const mockUseAuth = jest.fn();
jest.mock('../useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('useIsAppAdmin', () => {
  beforeEach(() => {
    mockIsAppAdmin.mockReset();
    mockUseAuth.mockReset();
  });

  it('is still loading while auth itself is resolving', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useIsAppAdmin());
    expect(result.current).toEqual({ isAppAdmin: false, loading: true });
  });

  // "Signed out" is a settled answer, not a pending one. Reporting it as
  // loading:true left every caller waiting on a promise that would never be
  // made -- the Wrapped screen renders a spinner until capabilities resolve,
  // so an anonymous visitor to /<pueblo>/resumen spun forever instead of being
  // redirected away.
  it('settles to "not an admin" once auth resolves to signed out', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useIsAppAdmin());
    expect(result.current).toEqual({ isAppAdmin: false, loading: false });
    expect(mockIsAppAdmin).not.toHaveBeenCalled();
  });

  it('resolves true when the service says so', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, loading: false });
    mockIsAppAdmin.mockResolvedValue(true);
    const { result } = renderHook(() => useIsAppAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAppAdmin).toBe(true);
    expect(mockIsAppAdmin).toHaveBeenCalledWith('u1');
  });

  it('resolves false when the service says so', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u2' }, loading: false });
    mockIsAppAdmin.mockResolvedValue(false);
    const { result } = renderHook(() => useIsAppAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAppAdmin).toBe(false);
  });
});
