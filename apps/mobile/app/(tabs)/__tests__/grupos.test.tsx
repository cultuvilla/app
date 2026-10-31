import type { ReactNode } from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import GroupsTabScreen from '../grupos';

let mockGroups: MyGroup[] = [];
const mockRemember = jest.fn().mockResolvedValue(undefined);
let mockRemembered: string | null = null;
let mockUnread = 0;
let mockNotices: { id: string; title: string; body: string; pinned: boolean; signerName: string; sentAt: Date; sentBy: string }[] = [];
let mockMyTasks: { id: string; title: string; dueOn: string | null; time: string | null; slots: number | null; claimedUids: string[] }[] = [];

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
  useGroupNotices: () => ({ unreadCount: mockUnread, notices: mockNotices, status: 'ready', readsStatus: 'ready', readIds: new Set() }),
}));
jest.mock('../../../lib/orgs/useMyOpenTasks', () => ({ useMyOpenTasks: () => ({ mine: mockMyTasks, shifts: [], status: 'ready' }) }));
let mockEvents: { id: string; title: string; startDate: Date; endDate: Date | null; confirmedCount: number; imageURL: null; villageCoverImage: null; villageSlug: string }[] = [];
jest.mock('../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string) => ({ data: label.includes('Events') ? mockEvents : [], status: 'ready', error: null }),
}));
const NO_CUOTA = { cuota: null, periodKey: null as string | null, rows: [] as { id: string; kind: string }[], payments: [], statuses: [] as { socioId: string; status: string }[], settled: true };
let mockCuota = NO_CUOTA;
jest.mock('../../../lib/orgs/useMyCuota', () => ({ useMyCuota: () => mockCuota }));
jest.mock('@cultuvilla/shared/services/eventService', () => ({ watchEventsByOrganization: jest.fn() }));
jest.mock('@cultuvilla/shared/services/socioService', () => ({ watchOrgSocios: jest.fn() }));
const mockPush = jest.fn();
let mockParams: { grupo?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../../components/layout/AppHeader', () => ({
  AppHeader: ({ centerLabel, onLabelPress, extraRightSlot }: { centerLabel: string; onLabelPress?: () => void; extraRightSlot?: ReactNode }) => {
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <>
        {onLabelPress ? (
          <Pressable testID="group-switcher-open" onPress={onLabelPress}>
            <Text>{centerLabel}</Text>
          </Pressable>
        ) : (
          <Text testID="header-label">{centerLabel}</Text>
        )}
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
  mockMyTasks = [];
  mockNotices = [];
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

  it('names the single group in the header, with no switcher', async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId, queryByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByTestId('header-label').props.children).toBe('Anduela');
    expect(queryByTestId('group-switcher-open')).toBeNull();
  });

  it("links to the group's public page", async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId } = render(<GroupsTabScreen />);
    fireEvent.press(await findByTestId('group-open-page'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/v/entidad/'));
  });

  it('reopens the last-used group and switches from the header sheet', async () => {
    mockGroups = [group('Anduela'), group('Peña')];
    mockRemembered = 'Peña';
    const { findByTestId, getByTestId, getAllByText, queryByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    // The header and the home's title.
    expect(getAllByText('Peña')).toHaveLength(2);
    expect(queryByText('Anduela')).toBeNull();
    fireEvent.press(getByTestId('group-switcher-open'));
    fireEvent.press(await findByTestId('group-switcher-Anduela'));
    await waitFor(() => expect(mockRemember).toHaveBeenCalledWith('Anduela'));
  });

  it("a member gets buttons for their screens and no Gestionar; each opens the group's screen", async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId, queryByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByTestId('stub-consent-unanswered')).toBeTruthy();
    for (const s of ['avisos', 'eventos', 'tareas', 'cuota', 'actas', 'mis-datos']) {
      expect(getByTestId(`group-section-${s}`)).toBeTruthy();
    }
    expect(queryByTestId('group-manage')).toBeNull();
    expect(queryByTestId('group-section-cobros')).toBeNull();
    fireEvent.press(getByTestId('group-section-cuota'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/Anduela/cuota');
  });

  it('badges the unread notices and my open tasks', async () => {
    mockGroups = [group('Anduela')];
    mockUnread = 2;
    mockMyTasks = [{ id: 't1', title: 'Comprar leña', dueOn: null, time: null, slots: null, claimedUids: [] }];
    const { findByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByTestId('group-section-avisos-badge')).toBeTruthy();
    expect(getByTestId('group-section-tareas-badge')).toBeTruthy();
    // My task also shows in the home's row.
    expect(getByTestId('group-home-task-t1')).toBeTruthy();
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
    fireEvent.press(getByTestId('group-home-notice-m1'));
    expect(mockPush).toHaveBeenLastCalledWith('/grupos/Anduela/avisos');
    expect(getByTestId('group-home-events')).toBeTruthy();
    expect(getByText('Matanza')).toBeTruthy();
  });

  it("shows the member's cuota status, opening its screen", async () => {
    mockGroups = [group('Anduela')];
    mockCuota = { ...NO_CUOTA, periodKey: '2026', rows: [{ id: 's1', kind: 'member' }], statuses: [{ socioId: 's1', status: 'vencida' }] };
    const { findByTestId, getByTestId, getByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByText('groups.cuota.status.vencida')).toBeTruthy();
    fireEvent.press(getByTestId('group-home-cuota'));
    expect(mockPush).toHaveBeenLastCalledWith('/grupos/Anduela/cuota');
  });

  it('an admin gets the Gestionar buttons', async () => {
    mockGroups = [group('Anduela', { joinPolicy: 'approval' }, 'admin')];
    const { findByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-manage');
    for (const s of ['cobros', 'mensajes', 'socios', 'gestion-tareas', 'registros', 'miembros', 'ajustes']) {
      expect(getByTestId(`group-section-${s}`)).toBeTruthy();
    }
    fireEvent.press(getByTestId('group-section-registros'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/Anduela/registros');
  });

  it('opens on the group a link names, and remembers it', async () => {
    mockGroups = [group('Anduela'), group('Peña')];
    mockRemembered = 'Anduela';
    mockParams = { grupo: 'Peña' };
    const { findByTestId, getAllByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getAllByText('Peña')).toHaveLength(2);
    expect(mockRemember).toHaveBeenCalledWith('Peña');
  });

  it('an ayuntamiento has no socio screens', async () => {
    mockGroups = [group('Ayto', { type: 'ayuntamiento' }, 'admin')];
    const { findByTestId, queryByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-manage');
    expect(queryByTestId('stub-consent-unanswered')).toBeNull();
    expect(queryByTestId('group-section-cuota')).toBeNull();
    expect(queryByTestId('group-section-cobros')).toBeNull();
    expect(getByTestId('group-section-tareas')).toBeTruthy();
    expect(getByTestId('group-section-miembros')).toBeTruthy();
  });
});
