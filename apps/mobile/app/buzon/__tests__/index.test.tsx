import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import InboxScreen from '../index';

jest.mock('../../../lib/i18n', () => {
  const { createI18n } = jest.requireActual('../../../lib/i18n');
  const { getMessages } = jest.requireActual('@cultuvilla/i18n');
  const i18n = createI18n({ es: getMessages('es') }, 'es');
  return { useT: () => i18n };
});

let mockApprover = {
  loading: false,
  isSuperAdmin: false,
  adminVillageIds: ['m1'],
  adminOrgIds: [] as string[],
  canApprove: true,
};
jest.mock('../../../lib/auth/useApproverStatus', () => ({
  useApproverStatus: () => mockApprover,
}));
const mockUser = { uid: 'u1' };
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    // Runs once on mount here; a real focus also re-runs it on the way back.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

const mockGetOpenReports = jest.fn();
const mockGetReportsByMunicipality = jest.fn();
jest.mock('@cultuvilla/shared/services/contentReportService', () => ({
  getOpenReports: () => mockGetOpenReports(),
  getReportsByMunicipality: (id: string, options: unknown) => mockGetReportsByMunicipality(id, options),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: async (id: string) =>
    ({ m1: { name: 'Anaya', slug: 'anaya' }, m2: { name: 'Pedraza', slug: 'pedraza' } })[id] ?? null,
}));
jest.mock('@cultuvilla/shared/services/organizerRequestService', () => ({
  getPendingOrganizerRequests: async () => [],
  respondToOrganizerRequest: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({ getPersonByUserId: async () => null }));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  getPendingOrganizations: async () => [],
  getOrganizationsByMunicipality: async () => [],
  getOrganization: async () => null,
  approveOrganization: jest.fn(),
  rejectOrganization: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/notificationService', () => ({
  getNotifications: async () => [],
  markAllAsRead: async () => undefined,
}));
let mockActivity: unknown[] = [];
jest.mock('@cultuvilla/shared/services/inboxService', () => ({
  getMyPendingRequests: async () => [],
  buildActivityFeed: () => mockActivity,
}));
let mockGroups: { org: { id: string }; role: string }[] = [];
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
let mockCosaRows: unknown[] = [];
const mockWatchCosaRequestsToAnswer = jest.fn();
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({
  watchCosaRequestsToAnswer: (uid: string, orgIds: string[], onNext: (rows: unknown[]) => void) => {
    mockWatchCosaRequestsToAnswer(uid, orgIds);
    onNext(mockCosaRows);
    return () => undefined;
  },
}));
jest.mock('@cultuvilla/shared/services/orgJoinRequestService', () => ({
  getPendingOrgJoinRequests: async () => [],
  respondToOrgJoinRequest: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/notifications/openNotification', () => ({
  isOpenableNotification: () => false,
  openNotification: jest.fn(),
}));
jest.mock('../../../components/feature/OrgJoinRequests', () => ({
  OrgJoinRequestRow: () => null,
  resolveRequester: jest.fn(),
}));

describe('Buzón — open reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApprover = {
      loading: false,
      isSuperAdmin: false,
      adminVillageIds: ['m1'],
      adminOrgIds: [],
      canApprove: true,
    };
    mockGetOpenReports.mockResolvedValue([]);
    mockGetReportsByMunicipality.mockResolvedValue([]);
  });

  it("shows a village admin their village's open reports and opens its Denuncias", async () => {
    mockGetReportsByMunicipality.mockResolvedValue([
      { id: 'r1', municipalityId: 'm1' },
      { id: 'r2', municipalityId: 'm1' },
    ]);
    const { findByTestId, getByText } = render(<InboxScreen />);

    fireEvent.press(await findByTestId('inbox-reports-m1'));

    expect(mockGetReportsByMunicipality).toHaveBeenCalledWith('m1', { status: 'open' });
    expect(mockGetOpenReports).not.toHaveBeenCalled();
    expect(getByText('Necesita tu acción')).toBeTruthy();
    expect(getByText('2 denuncias pendientes')).toBeTruthy();
    expect(router.push).toHaveBeenCalledWith('/anaya/denuncias');
  });

  it('gives an app admin one row per village, across all of them', async () => {
    mockApprover = { ...mockApprover, isSuperAdmin: true, adminVillageIds: [] };
    mockGetOpenReports.mockResolvedValue([
      { id: 'r1', municipalityId: 'm1' },
      { id: 'r2', municipalityId: 'm2' },
    ]);
    const { findByTestId, getAllByText } = render(<InboxScreen />);

    expect(await findByTestId('inbox-reports-m1')).toBeTruthy();
    expect(await findByTestId('inbox-reports-m2')).toBeTruthy();
    expect(getAllByText('1 denuncia pendiente')).toHaveLength(2);
    expect(mockGetReportsByMunicipality).not.toHaveBeenCalled();
  });

  it('reads no reports for someone who only administers a group', async () => {
    mockApprover = { ...mockApprover, adminVillageIds: [], adminOrgIds: ['o1'] };
    const { getByText } = render(<InboxScreen />);

    await waitFor(() => expect(getByText('No tienes nada nuevo')).toBeTruthy());
    expect(mockGetOpenReports).not.toHaveBeenCalled();
    expect(mockGetReportsByMunicipality).not.toHaveBeenCalled();
  });

  it('shows nothing for a village with an empty queue', async () => {
    const { getByText, queryByText } = render(<InboxScreen />);

    await waitFor(() => expect(getByText('No tienes nada nuevo')).toBeTruthy());
    expect(queryByText('Denuncias')).toBeNull();
  });
});

describe('Buzón — the cosateca', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApprover = { loading: false, isSuperAdmin: false, adminVillageIds: [], adminOrgIds: [], canApprove: false };
    mockGroups = [];
    mockCosaRows = [];
    mockActivity = [];
  });

  it('asks anyone who offered something to answer, approver or not, and opens the request', async () => {
    mockGroups = [{ org: { id: 'pena' }, role: 'admin' }, { org: { id: 'ayto' }, role: 'member' }];
    mockCosaRows = [
      {
        id: 'r1', orgId: 'pena', cosaId: 'c1', cosaTitle: 'Taladro', cosaKind: 'prestamo', requesterName: 'Luis', status: 'pending',
        fromOn: null, untilOn: null, createdAt: new Date(),
      },
    ];
    const { findByTestId, getByText, queryByText } = render(<InboxScreen />);
    fireEvent.press(await findByTestId('cosa-request-row-r1'));
    expect(mockWatchCosaRequestsToAnswer).toHaveBeenCalledWith('u1', ['pena']);
    expect(getByText('Necesita tu acción')).toBeTruthy();
    expect(getByText('Luis pide «Taladro»')).toBeTruthy();
    expect(await findByTestId('inbox-cosateca')).toBeTruthy();
    expect(queryByText('No tienes nada nuevo')).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/grupos/pena/prestamo/r1');
  });

  it('lists what I asked for while it waits', async () => {
    mockActivity = [{ kind: 'pending-sent', id: 'r2', requestType: 'cosa', label: 'Carpa', createdAt: new Date() }];
    const { findByText } = render(<InboxScreen />);
    expect(await findByText('Pediste «Carpa»')).toBeTruthy();
  });
});
