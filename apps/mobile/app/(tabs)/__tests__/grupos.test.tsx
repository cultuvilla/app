import type { ReactNode } from 'react';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import GroupsTabScreen from '../grupos';

let mockGroups: MyGroup[] = [];
const mockRemember = jest.fn().mockResolvedValue(undefined);
let mockRemembered: string | null = null;
let mockUnread = 0;
let mockNoticesStatus = 'ready';
let mockNotices: { id: string; title: string; body: string; pinned: boolean; signerName: string; sentAt: Date; sentBy: string }[] = [];
type TaskRow = {
  id: string;
  title: string;
  dueOn: string | null;
  time: string | null;
  slots: number | null;
  claimedUids: string[];
  assigneeUids: string[];
  eventId: string | null;
};
const task = (over: Partial<TaskRow> & { id: string }): TaskRow => ({
  title: 'Comprar leña', dueOn: null, time: null, slots: null, claimedUids: [], assigneeUids: [], eventId: null, ...over,
});
let mockOpenTasks: TaskRow[] = [];

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('../../../lib/orgs/lastGroup', () => ({
  ...jest.requireActual<typeof import('../../../lib/orgs/lastGroup')>('../../../lib/orgs/lastGroup'),
  readLastGroupId: () => Promise.resolve(mockRemembered),
  rememberLastGroupId: (id: string) => mockRemember(id),
}));
jest.mock('../../../lib/orgs/useGroupNotices', () => ({
  useGroupNotices: () => ({ unreadCount: mockUnread, notices: mockNotices, status: mockNoticesStatus, readsStatus: 'ready', readIds: new Set() }),
}));
let mockChatUnread = { generalUnread: false, unreadAvisoIds: new Set<string>() };
jest.mock('../../../lib/orgs/useGroupChatUnread', () => ({ useGroupChatUnread: () => mockChatUnread }));
jest.mock('../../../lib/orgs/useMyMessageValues', () => ({
  useMyMessageValues: () => ({ nombre: null, numero: null, cuotaCents: null }),
}));
jest.mock('../../../lib/orgs/useEventTaskBadges', () => ({ useEventTaskBadges: () => () => undefined }));
let mockEvents: { id: string; title: string; startDate: Date; endDate: Date | null; confirmedCount: number; imageURL: null; villageCoverImage: null; villageSlug: string }[] = [];
jest.mock('../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string) => ({
    data: label.includes('Events') ? mockEvents : label.includes('OpenGroupTasks') ? mockOpenTasks : [],
    status: 'ready',
    error: null,
  }),
}));
jest.mock('@cultuvilla/shared/services/groupTaskService', () => ({ watchOpenGroupTasks: jest.fn() }));
jest.mock('../../../lib/orgs/useOrgMembers', () => ({
  useMemberFaces: () => ({ a1: { name: 'Ana', photoURL: null }, a2: { name: 'Blas', photoURL: null } }),
}));
const NO_CUOTA = { cuota: null, periodKey: null as string | null, rows: [] as { id: string; kind: string }[], payments: [], statuses: [] as { socioId: string; status: string }[], settled: true };
let mockCuota = NO_CUOTA;
jest.mock('../../../lib/orgs/useMyCuota', () => ({ useMyCuota: () => mockCuota }));
jest.mock('@cultuvilla/shared/services/eventService', () => ({ watchEventsByOrganization: jest.fn() }));
jest.mock('@cultuvilla/shared/services/socioService', () => ({ watchOrgSocios: jest.fn() }));
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: { grupo?: string; aviso?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href), setParams: (p: unknown) => mockSetParams(p) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../../components/layout/AppHeader', () => ({
  AppHeader: ({ centerLabel, extraRightSlot }: { centerLabel: string; extraRightSlot?: ReactNode }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <>
        <Text testID="header-label">{centerLabel}</Text>
        {extraRightSlot}
      </>
    );
  },
}));
jest.mock('../../../components/feature/groups/SocioConsentCard', () => ({
  SocioConsentCard: ({ onlyWhenUnanswered }: { onlyWhenUnanswered?: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID={onlyWhenUnanswered ? 'stub-consent-unanswered' : 'stub-consent'}>consent</Text>;
  },
}));

function group(id: string, overrides: Partial<Parameters<typeof buildOrganizationData>[0]> = {}, role: 'admin' | 'member' = 'member'): MyGroup {
  return {
    org: {
      id,
      ...buildOrganizationData({ name: id, type: 'asociación', municipalityId: 'm', villageSlug: 'v', requestedBy: 'x', status: 'approved', ...overrides }),
    },
    role,
  };
}

beforeEach(() => {
  mockParams = {};
  mockRemembered = null;
  mockUnread = 0;
  mockOpenTasks = [];
  mockNotices = [];
  mockNoticesStatus = 'ready';
  mockEvents = [];
  mockCuota = NO_CUOTA;
  mockRemember.mockClear();
  mockPush.mockClear();
});

describe('Grupos tab', () => {
  it('says so when the user has no group left', async () => {
    mockGroups = [];
    const { findByTestId } = render(<GroupsTabScreen />);
    expect(await findByTestId('groups-empty')).toBeTruthy();
  });

  it('titles the header Grupos, with no switcher for a single group', async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId, queryByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByTestId('header-label').props.children).toBe('tabs.groups');
    expect(queryByTestId('group-switcher-open')).toBeNull();
  });

  it("reopens the last-used group and switches from the arrow beside the group's name", async () => {
    mockGroups = [group('Anduela'), group('Peña')];
    mockRemembered = 'Peña';
    const { findByTestId, getByTestId, getAllByText, getByText, queryByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    // The home's title names the group; the header just says Grupos.
    expect(getAllByText('Peña')).toHaveLength(1);
    expect(getByTestId('header-label').props.children).toBe('tabs.groups');
    expect(getByTestId('group-switcher-open')).toHaveTextContent(/^Pe/);
    expect(getByText('tabs.groups')).toBeTruthy();
    expect(queryByText('Anduela')).toBeNull();
    fireEvent.press(getByTestId('group-switcher-open'));
    fireEvent.press(await findByTestId('group-switcher-Anduela'));
    await waitFor(() => expect(mockRemember).toHaveBeenCalledWith('Anduela'));
  });

  it("a member gets their buttons under Acciones and no admin ones; each opens the group's screen", async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId, queryByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByTestId('stub-consent-unanswered')).toBeTruthy();
    for (const s of ['charla', 'cuota', 'actas', 'socios', 'ajustes']) {
      expect(getByTestId(`group-section-${s}`)).toBeTruthy();
    }
    expect(getByTestId('group-actions')).toHaveTextContent(/groups\.home\.actions/);
    expect(queryByTestId('group-section-cobros')).toBeNull();
    fireEvent.press(getByTestId('group-section-cuota'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/Anduela/cuota');
  });

  it('has no buttons for what its rows open, and counts the new avisos in their row', async () => {
    mockGroups = [group('Anduela')];
    mockUnread = 2;
    const { findByTestId, queryByTestId, getByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    for (const s of ['avisos', 'eventos', 'tareas']) expect(queryByTestId(`group-section-${s}`)).toBeNull();
    expect(getByText(/groups\.home\.avisosWithNew/)).toBeTruthy();
  });

  it('keeps the event and task rows with nothing to show, each opening its screen', async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId, getByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    fireEvent.press(getByText('groups.sections.empty.eventos'));
    expect(mockPush).toHaveBeenLastCalledWith('/grupos/Anduela/eventos');
    fireEvent.press(getByText('groups.tasks.noOpen'));
    expect(mockPush).toHaveBeenLastCalledWith('/grupos/Anduela/tareas');
  });

  it("lists every task the group still has to do, soonest first, with its day, event and people", async () => {
    mockGroups = [group('Anduela')];
    mockEvents = [
      { id: 'e1', title: 'Matanza', startDate: new Date(Date.now() + 86_400_000 * 10), endDate: null, confirmedCount: 3, imageURL: null, villageCoverImage: null, villageSlug: 'v' },
    ];
    mockOpenTasks = [
      task({ id: 'late', title: 'Limpiar', dueOn: null }),
      task({ id: 'soon', title: 'Comprar vino', dueOn: '2026-12-06', assigneeUids: ['a1', 'a2'], eventId: 'e1' }),
      task({ id: 'shift', title: 'Barra', dueOn: '2026-12-07', slots: 6, claimedUids: ['a1'] }),
    ];
    const { findByTestId, getByTestId, queryByText, getAllByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByTestId('group-home-tasks')).toBeTruthy();
    // The row clips: a card measured short would lose the faces at its foot.
    expect(getByTestId('group-home-task-soon').props.style).toMatchObject({ minHeight: expect.any(Number) });
    const ids = getAllByTestId(/^group-home-task-[a-z]+$/).map((el) => el.props.testID as string);
    expect(ids).toEqual(['group-home-task-soon', 'group-home-task-shift', 'group-home-task-late']);
    expect(getByTestId('group-home-task-soon-date')).toHaveTextContent('6 dic');
    expect(getByTestId('group-home-task-soon-event')).toHaveTextContent('Matanza');
    expect(getByTestId('group-home-task-soon-people')).toHaveTextContent('AB');
    // A shift shows who took it, not how many slots are left.
    expect(getByTestId('group-home-task-shift-people')).toHaveTextContent('A');
    expect(queryByText('groups.tasks.shift.slots')).toBeNull();
    expect(getByTestId('group-home-task-late-date')).toHaveTextContent('groups.tasks.noDate');
    fireEvent.press(getByTestId('group-home-task-soon'));
    expect(mockPush).toHaveBeenLastCalledWith('/grupos/Anduela/tarea/soon');
  });

  it('keeps the Avisos row with nothing to show, and when the read fails', async () => {
    mockGroups = [group('Anduela')];
    const { findByText, unmount } = render(<GroupsTabScreen />);
    expect(await findByText('groups.sections.empty.avisos')).toBeTruthy();
    unmount();
    mockNoticesStatus = 'error';
    expect(await render(<GroupsTabScreen />).findByText('groups.chat.loadError')).toBeTruthy();
  });

  it('keeps the Avisos row with nothing to show, and when the read fails', async () => {
    mockGroups = [group('Anduela')];
    const { findByText, unmount } = render(<GroupsTabScreen />);
    expect(await findByText('groups.sections.empty.avisos')).toBeTruthy();
    unmount();
    mockNoticesStatus = 'error';
    expect(await render(<GroupsTabScreen />).findByText('groups.chat.loadError')).toBeTruthy();
  });

  it('shows only upcoming events under Próximos eventos', async () => {
    mockGroups = [group('Anduela')];
    mockEvents = [
      { id: 'old', title: 'Romería pasada', startDate: new Date(Date.now() - 86_400_000 * 30), endDate: null, confirmedCount: 0, imageURL: null, villageCoverImage: null, villageSlug: 'v' },
      { id: 'next', title: 'Matanza', startDate: new Date(Date.now() + 86_400_000 * 10), endDate: null, confirmedCount: 0, imageURL: null, villageCoverImage: null, villageSlug: 'v' },
    ];
    const { findByTestId, queryByText, getByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByText('groups.sections.eventos')).toBeTruthy();
    expect(getByText('Matanza')).toBeTruthy();
    expect(queryByText('Romería pasada')).toBeNull();
  });

  it('reads like the village home: stats, then rows of notices and events', async () => {
    mockGroups = [group('Anduela')];
    mockNotices = [{ id: 'm1', title: 'Cena', body: 'El sábado', pinned: true, signerName: 'La junta', sentAt: new Date(), sentBy: 'x' }];
    mockEvents = [
      { id: 'e1', title: 'Matanza', startDate: new Date(Date.now() + 86_400_000 * 10), endDate: null, confirmedCount: 3, imageURL: null, villageCoverImage: null, villageSlug: 'v' },
    ];
    const { findByTestId, getByTestId, getByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByText('groups.stats.events')).toBeTruthy();
    // A member of a group whose estatutos keep the roster private sees no socio count.
    expect(() => getByText('groups.stats.socios')).toThrow();
    // A notice card is its title and text, cut at one box, and the day: no pinned badge, no sender.
    expect(getByTestId('group-home-notice-m1')).toHaveStyle({ height: 150 });
    const notice = getByTestId('group-home-notice-m1-text');
    expect(notice.props.numberOfLines).toBe(4);
    expect(notice).toHaveTextContent(/Cena\s*El sábado/);
    expect(getByTestId('group-home-notice-m1')).not.toHaveTextContent(/groups\.messages\.(pinnedBadge|sentBy)|La junta/);
    fireEvent.press(getByTestId('group-home-notice-m1'));
    expect(mockPush).toHaveBeenLastCalledWith('/grupos/Anduela/aviso/m1');
    expect(getByTestId('group-home-events')).toBeTruthy();
    expect(getByText('Matanza')).toBeTruthy();
  });

  // Regression: the row cards carried `h-full`. Under Yoga on native height:100%
  // resolves against the ScrollView viewport, so the Avisos card ran down the
  // screen without end. Equal heights come from the row's stretch instead.
  it('the notice and task cards declare no percentage height (breaks native layout)', async () => {
    mockGroups = [group('Anduela')];
    mockNotices = [{ id: 'm1', title: 'Cena', body: 'El sábado', pinned: false, signerName: 'La junta', sentAt: new Date(), sentBy: 'x' }];
    mockOpenTasks = [task({ id: 't1' })];
    const { findByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    const classNames: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const n = node as { props?: Record<string, unknown>; children?: unknown };
      const cn = n.props?.['className'];
      if (typeof cn === 'string') classNames.push(cn);
      walk(n.children);
    };
    walk([getByTestId('group-home-notice-m1'), getByTestId('group-home-task-t1')].map((el) => el.children));
    expect(classNames.length).toBeGreaterThan(0);
    expect(classNames.join(' ')).not.toMatch(/\bh-full\b/);
  });

  it("closes the home with the member's cuota banner, in place of its button", async () => {
    mockGroups = [group('Anduela')];
    mockCuota = { ...NO_CUOTA, periodKey: '2026', rows: [{ id: 's1', kind: 'member' }], statuses: [{ socioId: 's1', status: 'vencida' }] };
    const { findByTestId, getByTestId, getByText, queryByTestId } = render(<GroupsTabScreen />);
    const home = await findByTestId('group-home');
    expect(getByText('groups.cuota.status.vencida')).toBeTruthy();
    expect(queryByTestId('group-section-cuota')).toBeNull();
    const closing = home.children.at(-1);
    expect(closing && typeof closing !== 'string' && within(closing).queryByTestId('group-home-cuota')).toBeTruthy();
    fireEvent.press(getByTestId('group-home-cuota'));
    expect(mockPush).toHaveBeenLastCalledWith('/grupos/Anduela/cuota');
  });

  it("an admin gets their own buttons after the members' ones, in the same Acciones list", async () => {
    mockGroups = [group('Anduela', {}, 'admin')];
    const { findByTestId, getByTestId, getAllByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-actions');
    const order = getAllByTestId(/^group-section-[a-z-]+$/).map((el) => String(el.props.testID).replace('group-section-', ''));
    expect(order).toEqual(['charla', 'cuota', 'socios', 'ajustes', 'cobros', 'mensajes', 'registros']);
    expect(getByTestId('group-section-cobros').props.accessibilityHint).toBe('groups.sections.adminHint');
    expect(getByTestId('group-section-charla').props.accessibilityHint).toBeUndefined();
    fireEvent.press(getByTestId('group-section-registros'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/Anduela/registros');
  });

  it('opens on the group a link names, and remembers it', async () => {
    mockGroups = [group('Anduela'), group('Peña')];
    mockRemembered = 'Anduela';
    mockParams = { grupo: 'Peña' };
    const { findByTestId, getAllByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getAllByText('Peña')).toHaveLength(1);
    expect(mockRemember).toHaveBeenCalledWith('Peña');
  });

  it('an ayuntamiento has no socio screens', async () => {
    mockGroups = [group('Ayto', { type: 'ayuntamiento' }, 'admin')];
    const { findByTestId, queryByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-actions');
    expect(queryByTestId('stub-consent-unanswered')).toBeNull();
    expect(queryByTestId('group-section-cuota')).toBeNull();
    expect(queryByTestId('group-section-cobros')).toBeNull();
    expect(getByTestId('group-section-charla')).toBeTruthy();
    expect(getByTestId('group-section-miembros')).toBeTruthy();
  });

  it('badges what is new in the chats: the Charla, and the avisos on top of unread notices', async () => {
    mockGroups = [group('o1')];
    mockUnread = 1;
    mockChatUnread = { generalUnread: true, unreadAvisoIds: new Set(['a1', 'a2']) };
    const r = render(<GroupsTabScreen />);
    await waitFor(() => expect(r.getByTestId('group-section-charla-badge')).toBeTruthy());
    expect(r.getByText(/groups\.home\.avisosWithNew/)).toBeTruthy();
    mockChatUnread = { generalUnread: false, unreadAvisoIds: new Set() };
    mockUnread = 0;
  });

  it('an aviso’s link opens the group, with the aviso on top, once', async () => {
    mockGroups = [group('o1')];
    mockParams = { grupo: 'o1', aviso: 'm1' };
    render(<GroupsTabScreen />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/grupos/o1/aviso/m1'));
    expect(mockSetParams).toHaveBeenCalledWith({ aviso: undefined });
    mockParams = {};
  });
});
