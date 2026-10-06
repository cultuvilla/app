import { renderHook, waitFor } from '@testing-library/react-native';
import { useUnreadInboxCount } from '../useUnreadInboxCount';
import { emitWatched, resetWatchers, setWatched, watchersOf } from '../../../test/watchers';

const mockUseAuth = jest.fn();
jest.mock('../../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseApproverStatus = jest.fn();
jest.mock('../../auth/useApproverStatus', () => ({
  useApproverStatus: () => mockUseApproverStatus(),
}));

jest.mock('@cultuvilla/shared/services/notificationService', () => ({
  watchUnreadCount: jest
    .requireActual<typeof import('../../../test/watchers')>('../../../test/watchers')
    .mockWatcher('unread'),
}));
jest.mock('../../firestoreErrorLog', () => ({ reportFirestoreError: jest.fn() }));

const mockGetPendingOrganizerRequests = jest.fn();
jest.mock('@cultuvilla/shared/services/organizerRequestService', () => ({
  getPendingOrganizerRequests: () => mockGetPendingOrganizerRequests(),
}));

const mockGetPendingOrganizations = jest.fn();
const mockGetOrganizationsByMunicipality = jest.fn();
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  getPendingOrganizations: () => mockGetPendingOrganizations(),
  getOrganizationsByMunicipality: (municipalityId: string, status?: string) =>
    mockGetOrganizationsByMunicipality(municipalityId, status),
}));

const NOT_APPROVER = {
  loading: false,
  isSuperAdmin: false,
  adminVillageIds: [] as string[],
  canApprove: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  resetWatchers();
  mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });
  mockUseApproverStatus.mockReturnValue(NOT_APPROVER);
  setWatched('unread', 0);
  mockGetPendingOrganizerRequests.mockResolvedValue([]);
  mockGetPendingOrganizations.mockResolvedValue([]);
  mockGetOrganizationsByMunicipality.mockResolvedValue([]);
});

describe('useUnreadInboxCount', () => {
  it('guest (no user): count is 0, no service calls', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(watchersOf('unread')).toHaveLength(0);
  });

  it('non-approver: count is just unread notifications', async () => {
    setWatched('unread', 3);
    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(3));
    expect(mockGetPendingOrganizerRequests).not.toHaveBeenCalled();
    expect(mockGetOrganizationsByMunicipality).not.toHaveBeenCalled();
  });

  it('super admin: sums unread + all pending-actionable rows', async () => {
    setWatched('unread', 2);
    mockUseApproverStatus.mockReturnValue({
      loading: false,
      isSuperAdmin: true,
      adminVillageIds: [],
      canApprove: true,
    });
    mockGetPendingOrganizerRequests.mockResolvedValue([{ id: 'o1' }]);
    mockGetPendingOrganizations.mockResolvedValue([{ id: 'org1' }, { id: 'org2' }]);

    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(2 + 1 + 2));
  });

  it('village admin: sums unread + pending orgs across admin villages', async () => {
    setWatched('unread', 1);
    mockUseApproverStatus.mockReturnValue({
      loading: false,
      isSuperAdmin: false,
      adminVillageIds: ['v1', 'v2'],
      canApprove: true,
    });
    mockGetOrganizationsByMunicipality.mockImplementation((vid: string) =>
      Promise.resolve(vid === 'v1' ? [{ id: 'orgA' }] : []),
    );

    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(1 + 1));
    expect(mockGetOrganizationsByMunicipality).toHaveBeenCalledWith('v1', 'pending');
    expect(mockGetOrganizationsByMunicipality).toHaveBeenCalledWith('v2', 'pending');
  });

  it('service failure: falls back to count 0 rather than throwing', async () => {
    setWatched('unread', new Error('network error'));
    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(0));
  });

  // The badge follows the listener: a notification read in the Buzón (or a new
  // one landing) moves the count without the header refreshing.
  it('moves with the unread listener, with no refresh', async () => {
    setWatched('unread', 3);
    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(3));
    emitWatched('unread', 1);
    await waitFor(() => expect(result.current.count).toBe(1));
    expect(watchersOf('unread')).toHaveLength(1);
  });
});
