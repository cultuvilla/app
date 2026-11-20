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
jest.mock('../../firestoreErrorLog', () => ({ reportFirestoreError: jest.fn(), reportWatchError: jest.fn(), reportWatchStall: jest.fn() }));

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

// inboxService runs for real: the badge's reads are its `getActionableRequests`.
const mockGetPendingOrgJoinRequests = jest.fn();
jest.mock('@cultuvilla/shared/services/orgJoinRequestService', () => ({
  getPendingOrgJoinRequests: (orgId: string) => mockGetPendingOrgJoinRequests(orgId),
}));
const mockGetOpenReports = jest.fn();
const mockGetReportsByMunicipality = jest.fn();
jest.mock('@cultuvilla/shared/services/contentReportService', () => ({
  getOpenReports: () => mockGetOpenReports(),
  getReportsByMunicipality: (municipalityId: string) => mockGetReportsByMunicipality(municipalityId),
}));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({}));

const NOT_APPROVER = {
  loading: false,
  isSuperAdmin: false,
  adminVillageIds: [] as string[],
  adminOrgIds: [] as string[],
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
      adminOrgIds: [],
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
      adminOrgIds: [],
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

  // The subset is deliberate (BADGE_KINDS): the Buzón lists more than the bell counts.
  it('counts only organizer and org-creation requests, never joins or reports', async () => {
    setWatched('unread', 0);
    mockUseApproverStatus.mockReturnValue({
      loading: false,
      isSuperAdmin: true,
      adminVillageIds: ['v1'],
      adminOrgIds: ['o1'],
      canApprove: true,
    });
    mockGetPendingOrganizerRequests.mockResolvedValue([{ id: 'o1' }]);
    mockGetPendingOrganizations.mockResolvedValue([{ id: 'org1' }]);

    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(mockGetPendingOrgJoinRequests).not.toHaveBeenCalled();
    expect(mockGetOpenReports).not.toHaveBeenCalled();
    expect(mockGetReportsByMunicipality).not.toHaveBeenCalled();
  });

  it('org admin only: counts just unread, with no request reads', async () => {
    setWatched('unread', 1);
    mockUseApproverStatus.mockReturnValue({ ...NOT_APPROVER, adminOrgIds: ['o1'], canApprove: true });

    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(1));
    expect(mockGetPendingOrgJoinRequests).not.toHaveBeenCalled();
    expect(mockGetPendingOrganizations).not.toHaveBeenCalled();
    expect(mockGetOrganizationsByMunicipality).not.toHaveBeenCalled();
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
