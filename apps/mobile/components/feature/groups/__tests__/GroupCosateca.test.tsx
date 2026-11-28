import { act, fireEvent, render } from '@testing-library/react-native';
import { buildCosaData, buildCosaRequestData, buildOrganizationData } from '@cultuvilla/shared/models/organization';
import { GroupCosateca } from '../cosateca/GroupCosateca';
import { requestsToMe } from '../cosateca/useCosatecaRequests';

const mockPush = jest.fn();
const mockRespond = jest.fn((..._args: unknown[]) => Promise.resolve('accepted' as const));
const mockConfirm = jest.fn((_title: string, _body: string, onConfirm: () => void) => onConfirm());
let mockCosas: unknown[] = [];
let mockMine: unknown[] = [];
let mockToMe: unknown[] = [];
let mockOfGroup: unknown[] = [];

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@cultuvilla/shared/services/cosatecaService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/cosatecaService')>('@cultuvilla/shared/services/cosatecaService', () => ({
      respondToCosaRequest: (...args: unknown[]) => mockRespond(...args),
    })),
);
jest.mock('../../../../lib/dialogs', () => ({
  showAlert: jest.fn(),
  showConfirm: (title: string, body: string, onConfirm: () => void) => mockConfirm(title, body, onConfirm),
}));
jest.mock('../../../../lib/orgs/cuota', () => ({ todayKey: () => '2026-11-21' }));
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
    ...buildCosaData({ municipalityId: 'm1', orgId: 'pena', audience: 'integrantes', ownerUid: 'u2', ownerName: 'Luis', kind: 'prestamo', title, category, createdBy: 'u2', createdByName: 'Luis' }),
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
  it('shows the catalogue as cards by title, filtered by category, without what was given away', () => {
    const { getByTestId, queryByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    expect(getByTestId('group-cosateca')).toContainElement(getByTestId('cosateca-catalogue'));
    expect(getByTestId('cosa-card-state-c1')).toHaveTextContent('groups.cosateca.chip.free');
    expect(getByTestId('cosa-card-tile-c1')).toBeTruthy();
    expect(getByTestId('cosa-card-c2')).toBeTruthy();
    expect(queryByTestId('cosa-card-c3')).toBeNull();
    expect(getByTestId('cosa-categories')).toBeTruthy();
    fireEvent.press(getByTestId('cosa-categories-fiestas'));
    expect(queryByTestId('cosa-card-c1')).toBeNull();
    fireEvent.press(getByTestId('cosa-card-c2'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/pena/cosa/c2');
  });

  it('finds a cosa by name, accents aside, and says when nothing matches', () => {
    const { getByTestId, queryByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    fireEvent.changeText(getByTestId('cosateca-search'), 'CARPÁ');
    expect(queryByTestId('cosa-card-c1')).toBeNull();
    expect(getByTestId('cosa-card-c2')).toBeTruthy();
    fireEvent.changeText(getByTestId('cosateca-search'), 'hormigonera');
    expect(getByTestId('cosateca-empty')).toHaveTextContent('groups.cosateca.noMatches');
  });

  it('hides "En marcha" while nothing is going on', () => {
    const { queryByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    expect(queryByTestId('cosateca-active')).toBeNull();
  });

  it('splits "En marcha" into what waits on me and what is under way, and keeps every request behind "Todo"', () => {
    mockToMe = [request('r1'), request('r2', { status: 'returned' })];
    mockMine = [
      request('r3', { requesterUid: 'u1', ownerUid: 'u2', status: 'lent', untilOn: '2026-11-28' }),
      request('r4', { requesterUid: 'u1', ownerUid: 'u2', orgId: 'other', status: 'lent' }),
    ];
    const { getByTestId, queryByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    expect(getByTestId('cosateca-toca')).toHaveTextContent(/groups.cosateca.active.tocaTitle\s*1/);
    expect(getByTestId('cosateca-active-r1')).toHaveTextContent(/groups.cosateca.active.toca.answer/);
    expect(getByTestId('cosateca-curso')).toContainElement(getByTestId('cosateca-active-r3'));
    expect(getByTestId('cosateca-active-r3')).toHaveTextContent(/groups.cosateca.active.backOn/);
    expect(queryByTestId('cosateca-calm')).toBeNull();
    expect(queryByTestId('cosateca-active-r2')).toBeNull();
    expect(queryByTestId('cosateca-active-r4')).toBeNull();
    fireEvent.press(getByTestId('cosateca-active-r1'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/pena/prestamo/r1');

    fireEvent.press(getByTestId('cosateca-inbox-open'));
    const inbox = getByTestId('cosateca-inbox');
    expect(inbox).toContainElement(getByTestId('cosa-request-row-r1'));
    expect(inbox).toContainElement(getByTestId('cosa-request-row-r2'));
    expect(inbox).toContainElement(getByTestId('cosa-request-row-r3'));
    expect(queryByTestId('cosa-request-row-r4')).toBeNull();
    fireEvent.press(getByTestId('cosa-request-row-r3'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/pena/prestamo/r3');
    expect(queryByTestId('cosateca-inbox')).toBeNull();
  });

  it('accepts a request right from its card', async () => {
    mockToMe = [request('r1')];
    const { getByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    fireEvent.press(getByTestId('cosateca-active-accept-r1'));
    expect(mockRespond).toHaveBeenCalledWith('r1', 'accept');
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it('asks before refusing a request from its card', async () => {
    mockToMe = [request('r1')];
    const { getByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    fireEvent.press(getByTestId('cosateca-active-decline-r1'));
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockRespond).toHaveBeenCalledWith('r1', 'decline');
    await act(async () => {});
  });

  it('says so in green when nothing waits on me, and shows at most three rows under way', () => {
    mockMine = ['r1', 'r2', 'r3', 'r4'].map((id) => request(id, { requesterUid: 'u1', ownerUid: 'u2', status: 'pending' }));
    const { getByTestId, queryByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    expect(getByTestId('cosateca-calm')).toHaveTextContent(/groups.cosateca.active.calm/);
    expect(queryByTestId('cosateca-toca')).toBeNull();
    expect(getByTestId('cosateca-curso')).toContainElement(getByTestId('cosateca-active-r4'));
    expect(queryByTestId('cosateca-active-r1')).toBeNull();
  });

  it('keeps "Todo" for past requests even when nothing is going on', () => {
    mockMine = [request('r1', { requesterUid: 'u1', ownerUid: 'u2', status: 'returned' })];
    const { getByTestId, queryByTestId } = render(<GroupCosateca group={{ org, role: 'member' }} uid="u1" />);
    expect(queryByTestId('cosateca-toca')).toBeNull();
    expect(queryByTestId('cosateca-curso')).toBeNull();
    expect(getByTestId('cosateca-inbox-open')).toHaveTextContent(/groups.cosateca.active.all/);
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
