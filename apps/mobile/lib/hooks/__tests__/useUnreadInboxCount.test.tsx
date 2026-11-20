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
  getReportsByMunicipality: (municipalityId: string, options?: { status?: string }) =>
    mockGetReportsByMunicipality(municipalityId, options),
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
  mockGetPendingOrgJoinRequests.mockResolvedValue([]);
  mockGetOpenReports.mockResolvedValue([]);
  mockGetReportsByMunicipality.mockResolvedValue([]);
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

  it('super admin: sums unread + every actionable queue, app-wide', async () => {
    setWatched('unread', 2);
    mockUseApproverStatus.mockReturnValue({
      loading: false,
      isSuperAdmin: true,
      adminVillageIds: [],
      adminOrgIds: ['o1'],
      canApprove: true,
    });
    mockGetPendingOrganizerRequests.mockResolvedValue([{ id: 'o1' }]);
    mockGetPendingOrganizations.mockResolvedValue([{ id: 'org1' }, { id: 'org2' }]);
    mockGetPendingOrgJoinRequests.mockResolvedValue([{ orgId: 'o1', userId: 'u9' }]);
    mockGetOpenReports.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);

    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(2 + 1 + 2 + 1 + 3));
    expect(mockGetReportsByMunicipality).not.toHaveBeenCalled();
  });

  it('village admin: sums unread + pending orgs and open reports across admin villages', async () => {
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
    mockGetReportsByMunicipality.mockImplementation((vid: string) =>
      Promise.resolve(vid === 'v2' ? [{ id: 'r1' }, { id: 'r2' }] : []),
    );

    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(1 + 1 + 2));
    expect(mockGetOrganizationsByMunicipality).toHaveBeenCalledWith('v1', 'pending');
    expect(mockGetOrganizationsByMunicipality).toHaveBeenCalledWith('v2', 'pending');
    expect(mockGetReportsByMunicipality).toHaveBeenCalledWith('v1', { status: 'open' });
    expect(mockGetReportsByMunicipality).toHaveBeenCalledWith('v2', { status: 'open' });
    expect(mockGetPendingOrganizerRequests).not.toHaveBeenCalled();
    expect(mockGetOpenReports).not.toHaveBeenCalled();
  });

  it("org admin only: sums unread + the join requests of the user's groups", async () => {
    setWatched('unread', 1);
    mockUseApproverStatus.mockReturnValue({ ...NOT_APPROVER, adminOrgIds: ['o1', 'o2'], canApprove: true });
    mockGetPendingOrgJoinRequests.mockImplementation((oid: string) =>
      Promise.resolve(oid === 'o1' ? [{ orgId: 'o1', userId: 'a' }, { orgId: 'o1', userId: 'b' }] : []),
    );

    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(1 + 2));
    expect(mockGetPendingOrgJoinRequests).toHaveBeenCalledWith('o1');
    expect(mockGetPendingOrgJoinRequests).toHaveBeenCalledWith('o2');
    expect(mockGetPendingOrganizations).not.toHaveBeenCalled();
    expect(mockGetOrganizationsByMunicipality).not.toHaveBeenCalled();
    expect(mockGetOpenReports).not.toHaveBeenCalled();
    expect(mockGetReportsByMunicipality).not.toHaveBeenCalled();
  });

  // The bell holds what the Buzón's "Necesita tu acción" lists: the same scope,
  // read through the same service, counted the same way.
  it('agrees with the Buzón for the same scope', async () => {
    setWatched('unread', 0);
    const roles = { isSuperAdmin: false, adminVillageIds: ['v1'], adminOrgIds: ['o1'] };
    mockUseApproverStatus.mockReturnValue({ loading: false, canApprove: true, ...roles });
    mockGetOrganizationsByMunicipality.mockResolvedValue([{ id: 'orgA' }]);
    mockGetPendingOrgJoinRequests.mockResolvedValue([{ orgId: 'o1', userId: 'a' }]);
    mockGetReportsByMunicipality.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

    const { actionableCount, actionableScope, getActionableRequests } =
      jest.requireActual<typeof import('@cultuvilla/shared/services/inboxService')>(
        '@cultuvilla/shared/services/inboxService',
      );
    const buzon = actionableCount(await getActionableRequests(actionableScope(roles)));

    const { result } = renderHook(() => useUnreadInboxCount());
    await waitFor(() => expect(result.current.count).toBe(buzon));
    expect(buzon).toBe(4);
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
