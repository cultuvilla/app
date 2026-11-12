import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildCosaRequestData } from '@cultuvilla/shared/models/organization';
import { respondToCosaRequest } from '@cultuvilla/shared/services/cosatecaService';
import { showAlert } from '../../../lib/dialogs';
import CosaRequestScreen from '../[grupo]/prestamo/[solicitud]';

const mockPush = jest.fn();
let mockGroups: { org: { id: string }; role: string }[] = [];
let mockRequest: unknown = null;
let mockUid = 'owner';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
  useLocalSearchParams: () => ({ grupo: 'pena', solicitud: 'r1' }),
}));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({
  respondToCosaRequest: jest.fn().mockResolvedValue('accepted'),
  watchCosaRequest: jest.fn(),
}));
jest.mock('../../../lib/dialogs', () => ({ showAlert: jest.fn() }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('../../../lib/hooks/useWatch', () => ({ useWatch: () => ({ data: mockRequest, status: 'ready' }) }));
jest.mock('../../../components/layout/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="screen-title">{title}</Text>;
  },
}));

jest.mock('../../../components/feature/groups/cosateca/CosaRequestChat', () => ({
  CosaRequestChat: ({ canModerate }: { canModerate: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="stub-chat">{canModerate ? 'moderator' : 'party'}</Text>;
  },
}));

function request(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    ...buildCosaRequestData({
      municipalityId: 'm1', orgId: 'pena', cosaId: 'c1', cosaTitle: 'Taladro', cosaKind: 'prestamo', ownerUid: 'owner',
      requesterUid: 'asker', requesterName: 'Luis', message: 'Para el sábado', fromOn: '2026-07-01', untilOn: '2026-07-03',
    }),
    ...over,
  };
}

const actionsOf = (getAll: (id: RegExp) => { props: { testID?: string } }[]) =>
  getAll(/^cosa-request-(accept|decline|cancel|lend|return|done|give)$/).map((n) => n.props.testID);

beforeEach(() => {
  jest.clearAllMocks();
  mockGroups = [{ org: { id: 'pena' }, role: 'member' }];
  mockRequest = request();
  mockUid = 'owner';
});

describe('a request for a cosa', () => {
  it('lets its owner accept or decline a pending one', async () => {
    const { getByTestId, getAllByTestId } = render(<CosaRequestScreen />);
    expect(getByTestId('cosa-request')).toHaveTextContent(/Para el sábado/);
    expect(getByTestId('cosa-request-status')).toHaveTextContent('groups.cosateca.status.pending');
    expect(getByTestId('cosa-request-dates')).toHaveTextContent('groups.cosateca.request.range');
    expect(actionsOf(getAllByTestId)).toEqual(['cosa-request-accept', 'cosa-request-decline']);
    fireEvent.press(getByTestId('cosa-request-accept'));
    await waitFor(() => expect(respondToCosaRequest).toHaveBeenCalledWith('r1', 'accept'));
  });

  it('lets its requester only cancel, and an outsider nothing', () => {
    mockUid = 'asker';
    mockGroups = [];
    const asker = render(<CosaRequestScreen />);
    expect(actionsOf(asker.getAllByTestId)).toEqual(['cosa-request-cancel']);
    asker.unmount();
    mockUid = 'someone';
    expect(render(<CosaRequestScreen />).queryByTestId('cosa-request-actions')).toBeNull();
  });

  it('walks the loan on: lend once accepted, return once lent, for the manager', () => {
    mockRequest = request({ status: 'accepted' });
    const accepted = render(<CosaRequestScreen />);
    expect(actionsOf(accepted.getAllByTestId)).toEqual(['cosa-request-decline', 'cosa-request-lend']);
    accepted.unmount();
    mockRequest = request({ status: 'lent' });
    mockGroups = [{ org: { id: 'pena' }, role: 'admin' }];
    mockUid = 'admin';
    expect(actionsOf(render(<CosaRequestScreen />).getAllByTestId)).toEqual(['cosa-request-return']);
  });

  it("takes the admin rights from the request's group, not the URL's", () => {
    // Admin of the URL's group (pena), looking at a request of another group.
    mockUid = 'admin';
    mockGroups = [{ org: { id: 'pena' }, role: 'admin' }];
    mockRequest = request({ orgId: 'otro' });
    expect(render(<CosaRequestScreen />).queryByTestId('cosa-request-actions')).toBeNull();
  });

  it("shows the handover chat to the request's parties only, moderated by the group's admins", () => {
    const owner = render(<CosaRequestScreen />);
    expect(owner.getByTestId('stub-chat')).toHaveTextContent('party');
    owner.unmount();
    mockUid = 'admin';
    mockGroups = [{ org: { id: 'pena' }, role: 'admin' }];
    const admin = render(<CosaRequestScreen />);
    expect(admin.getByTestId('stub-chat')).toHaveTextContent('moderator');
    admin.unmount();
    mockUid = 'someone';
    mockGroups = [];
    expect(render(<CosaRequestScreen />).queryByTestId('stub-chat')).toBeNull();
  });

  it('lets either side mark a servicio done', () => {
    mockRequest = request({ cosaKind: 'servicio', status: 'accepted' });
    mockUid = 'asker';
    expect(actionsOf(render(<CosaRequestScreen />).getAllByTestId)).toEqual(['cosa-request-cancel', 'cosa-request-done']);
  });

  it("shows the callable's own reason when it refuses", async () => {
    jest.mocked(respondToCosaRequest).mockRejectedValueOnce(
      Object.assign(new Error('Ya está prestada o comprometida en esas fechas.'), { code: 'functions/failed-precondition' }),
    );
    const { getByTestId } = render(<CosaRequestScreen />);
    fireEvent.press(getByTestId('cosa-request-accept'));
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('Ya está prestada o comprometida en esas fechas.'));
  });

  it('opens the cosa, and says so when the request is gone', () => {
    const { getByTestId, unmount } = render(<CosaRequestScreen />);
    fireEvent.press(getByTestId('cosa-request-open-cosa'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/pena/cosa/c1');
    unmount();
    mockRequest = null;
    expect(render(<CosaRequestScreen />).getByTestId('cosa-request-unavailable')).toBeTruthy();
  });

  it("lets a colectivizado cosa's holder hand it on, never take it back, and its owner nothing", async () => {
    mockRequest = request({ status: 'accepted', cosaMode: 'colectivizado', holderUid: 'pepa', untilOn: null });
    mockUid = 'pepa';
    const { getByTestId, getAllByTestId, unmount } = render(<CosaRequestScreen />);
    expect(actionsOf(getAllByTestId)).toEqual(['cosa-request-decline', 'cosa-request-lend']);
    expect(getByTestId('cosa-request-lend')).toHaveTextContent('groups.cosateca.actions.handOver');
    expect(getByTestId('cosa-request-action-hint')).toHaveTextContent('groups.cosateca.actionHints.handOver');
    fireEvent.press(getByTestId('cosa-request-lend'));
    await waitFor(() => expect(respondToCosaRequest).toHaveBeenCalledWith('r1', 'lend'));
    unmount();

    // Once handed over it has nothing left to do: no return.
    mockRequest = request({ status: 'lent', cosaMode: 'colectivizado', holderUid: 'pepa', untilOn: null });
    expect(render(<CosaRequestScreen />).queryByTestId('cosa-request-actions')).toBeNull();

    mockRequest = request({ status: 'pending', cosaMode: 'colectivizado', holderUid: 'pepa', untilOn: null });
    mockUid = 'owner';
    expect(render(<CosaRequestScreen />).queryByTestId('cosa-request-actions')).toBeNull();
  });
});
