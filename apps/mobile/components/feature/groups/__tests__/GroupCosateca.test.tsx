import { fireEvent, render } from '@testing-library/react-native';
import { buildCosaData, buildCosaRequestData, buildOrganizationData } from '@cultuvilla/shared/models/organization';
import { GroupCosateca, requestsToMe } from '../cosateca/GroupCosateca';

const mockPush = jest.fn();
let mockCosas: unknown[] = [];
let mockMine: unknown[] = [];
let mockToMe: unknown[] = [];
let mockOfGroup: unknown[] = [];

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({
  watchCosaRequestsToMe: jest.fn(),
  watchGroupCosaRequests: jest.fn(),
  watchGroupCosas: jest.fn(),
  watchMyCosaRequests: jest.fn(),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' }, profile: { displayName: 'Ana' } }) }));
jest.mock('../../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string, key: string | null) => {
    if (!key) return { data: undefined, status: 'ready' };
    const data = {
      'cosateca:watchGroupCosas': mockCosas,
      'cosateca:watchMyCosaRequests': mockMine,
      'cosateca:watchCosaRequestsToMe': mockToMe,
      'cosateca:watchGroupCosaRequests': mockOfGroup,
    }[label];
    return { data, status: 'ready' };
  },
}));
jest.mock('../cosateca/CosaSheet', () => ({
  CosaSheet: ({ visible, isAdmin }: { visible: boolean; isAdmin: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text testID="stub-sheet">{String(isAdmin)}</Text> : null;
  },
}));

const org = { id: 'pena', ...buildOrganizationData({ name: 'Peña', type: 'peña', municipalityId: 'm1', villageSlug: 'v', requestedBy: 'x' }) };

function cosa(id: string, title: string, category: 'herramientas' | 'fiestas', over: Record<string, unknown> = {}) {
  return {
    id,
    ...buildCosaData({ municipalityId: 'm1', orgId: 'pena', audience: 'integrantes', ownerUid: 'u2', ownerName: 'Luis', kind: 'prestamo', title, category, createdBy: 'u2' }),
    ...over,
  };
}

function request(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    ...buildCosaRequestData({
      municipalityId: 'm1', orgId: 'pena', cosaId: 'c1', cosaTitle: 'Taladro', cosaKind: 'prestamo', ownerUid: 'u1',
      requesterUid: 'u3', requesterName: 'Pepa', createdAt: new Date(2026, 0, Number(id.slice(1))),
    }),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCosas = [cosa('c1', 'Taladro', 'herramientas'), cosa('c2', 'Carpa', 'fiestas'), cosa('c3', 'Bici', 'fiestas', { status: 'given' })];
  mockMine = [];
  mockToMe = [];
  mockOfGroup = [];
});

describe("a group's cosateca", () => {
  it('lists the catalogue by title, filtered by category, without what was given away', () => {
    const { getByTestId, queryByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    expect(getByTestId('group-cosateca')).toContainElement(getByTestId('cosateca-catalogue'));
    expect(getByTestId('cosa-row-c1')).toBeTruthy();
    expect(getByTestId('cosa-row-state-c1')).toHaveTextContent('groups.cosateca.availability.available');
    expect(getByTestId('cosa-categories')).toBeTruthy();
    expect(getByTestId('cosa-row-c2')).toBeTruthy();
    expect(queryByTestId('cosa-row-c3')).toBeNull();
    fireEvent.press(getByTestId('cosa-categories-fiestas'));
    expect(queryByTestId('cosa-row-c1')).toBeNull();
    fireEvent.press(getByTestId('cosa-row-c2'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/pena/cosa/c2');
  });

  it('shows what I asked for in this group only', () => {
    mockMine = [request('r1', { requesterUid: 'u1' }), request('r2', { orgId: 'other', requesterUid: 'u1' })];
    const { getByTestId, queryByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    expect(getByTestId('cosateca-tab')).toBeTruthy();
    fireEvent.press(getByTestId('cosateca-tab-pedi'));
    expect(getByTestId('cosateca-requests-pedi')).toBeTruthy();
    expect(getByTestId('cosa-request-row-r1')).toBeTruthy();
    expect(queryByTestId('cosa-request-row-r2')).toBeNull();
    fireEvent.press(getByTestId('cosa-request-row-r1'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/pena/prestamo/r1');
  });

  it('opens the offer form, telling it whether the viewer may offer for the group', () => {
    const admin = render(<GroupCosateca group={{ org, role: 'admin' }} uid="u1" />);
    fireEvent.press(admin.getByTestId('cosateca-offer'));
    expect(admin.getByTestId('stub-sheet')).toHaveTextContent('true');
  });
});

describe('requestsToMe', () => {
  it("merges my cosas' requests in this group with the group's own, newest first, once each", () => {
    const toMe = [request('r1'), request('r3', { orgId: 'other' })];
    const ofGroup = [request('r2', { ownerUid: null }), request('r1'), request('r4', { ownerUid: 'u9' })];
    expect(requestsToMe('pena', toMe, ofGroup).map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(requestsToMe('pena', toMe, null).map((r) => r.id)).toEqual(['r1']);
  });
});
