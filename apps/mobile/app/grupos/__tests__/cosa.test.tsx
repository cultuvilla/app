import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildCosaData, buildCosaRequestData, type CosaData } from '@cultuvilla/shared/models/organization';
import { updateCosa } from '@cultuvilla/shared/services/cosatecaService';
import CosaScreen from '../[grupo]/cosa/[cosa]';

const mockPush = jest.fn();
let mockGroups: { org: { id: string }; role: string }[] = [];
let mockCosa: unknown = null;
let mockMine: unknown[] = [];
let mockManaged: unknown[] = [];

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
  useLocalSearchParams: () => ({ grupo: 'ayto', cosa: 'c1' }),
}));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({
  updateCosa: jest.fn().mockResolvedValue(undefined),
  watchCosa: jest.fn(),
  watchCosaRequestsToMe: jest.fn(),
  watchGroupCosaRequests: jest.fn(),
  watchMyCosaRequests: jest.fn(),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' }, profile: { displayName: 'Ana' } }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string) => {
    if (label === 'cosateca:watchCosa') return { data: mockCosa, status: 'ready' };
    if (label === 'cosateca:watchMyCosaRequests') return { data: mockMine, status: 'ready' };
    return { data: mockManaged, status: 'ready' };
  },
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="screen-title">{title}</Text>;
  },
}));
jest.mock('../../../components/feature/groups/cosateca/AskCosaSheet', () => ({
  AskCosaSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text testID="stub-ask">ask</Text> : null;
  },
}));
jest.mock('../../../components/feature/groups/cosateca/CosaSheet', () => ({
  CosaSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text testID="stub-edit">edit</Text> : null;
  },
}));

function cosa(over: Partial<CosaData> = {}) {
  return {
    id: 'c1',
    ...buildCosaData({
      municipalityId: 'm1', orgId: 'ayto', audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento',
      kind: 'prestamo', title: 'Llave del gimnasio', category: 'deporte', createdBy: 'admin', conditions: 'Devolver el lunes',
    }),
    ...over,
  };
}

function request(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    ...buildCosaRequestData({
      municipalityId: 'm1', orgId: 'ayto', cosaId: 'c1', cosaTitle: 'Llave del gimnasio', cosaKind: 'prestamo', ownerUid: null,
      requesterUid: 'u1', requesterName: 'Ana',
    }),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGroups = [];
  mockCosa = cosa();
  mockMine = [];
  mockManaged = [];
});

describe("a cosa's screen", () => {
  it('lets a villager who is not in the group ask for a pueblo cosa', () => {
    const { getByTestId, queryByTestId } = render(<CosaScreen />);
    expect(getByTestId('cosa-detail')).toBeTruthy();
    expect(getByTestId('cosa-state')).toHaveTextContent('groups.cosateca.availability.available');
    expect(queryByTestId('cosa-manage')).toBeNull();
    fireEvent.press(getByTestId('cosa-ask'));
    expect(getByTestId('stub-ask')).toBeTruthy();
  });

  it('sends whoever already asked to their request instead', () => {
    mockMine = [request({ status: 'accepted' })];
    const { getByTestId, queryByTestId } = render(<CosaScreen />);
    expect(queryByTestId('cosa-ask')).toBeNull();
    fireEvent.press(getByTestId('cosa-see-request'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/ayto/prestamo/r1');
  });

  it('a closed request does not stop asking again', () => {
    mockMine = [request({ status: 'returned' })];
    expect(render(<CosaScreen />).getByTestId('cosa-ask')).toBeTruthy();
  });

  it('offers nothing to ask for a paused cosa', () => {
    mockCosa = cosa({ status: 'paused' });
    const { getByTestId, queryByTestId } = render(<CosaScreen />);
    expect(queryByTestId('cosa-ask')).toBeNull();
    expect(getByTestId('cosa-not-available')).toBeTruthy();
  });

  it("gives the group's admin the editing, the pause and the cosa's requests", async () => {
    mockGroups = [{ org: { id: 'ayto' }, role: 'admin' }];
    mockManaged = [request({ id: 'r2', requesterUid: 'u9', requesterName: 'Luis' }), request({ id: 'r3', cosaId: 'other' })];
    const { getByTestId, queryByTestId } = render(<CosaScreen />);
    expect(getByTestId('cosa-request-row-r2')).toBeTruthy();
    expect(queryByTestId('cosa-request-row-r3')).toBeNull();
    fireEvent.press(getByTestId('cosa-edit'));
    expect(getByTestId('stub-edit')).toBeTruthy();
    fireEvent.press(getByTestId('cosa-pause'));
    await waitFor(() => expect(updateCosa).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'paused' })));
  });

  it('tells its owner it is theirs, and lets a plain integrante only ask', () => {
    mockGroups = [{ org: { id: 'ayto' }, role: 'member' }];
    mockCosa = cosa({ ownerUid: 'u1', ownerName: 'Ana' });
    const owner = render(<CosaScreen />);
    expect(owner.getByTestId('cosa-yours')).toBeTruthy();
    expect(owner.getByTestId('cosa-manage')).toBeTruthy();
    owner.unmount();
    mockCosa = cosa({ ownerUid: 'u7', ownerName: 'Pepa' });
    const member = render(<CosaScreen />);
    expect(member.queryByTestId('cosa-manage')).toBeNull();
    expect(member.getByTestId('cosa-ask')).toBeTruthy();
  });

  it('says so when the cosa is gone', () => {
    mockCosa = null;
    expect(render(<CosaScreen />).getByTestId('cosa-unavailable')).toBeTruthy();
  });
});
