import type { ReactNode } from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import GroupsTabScreen from '../grupos';

let mockGroups: MyGroup[] = [];
const mockRemember = jest.fn().mockResolvedValue(undefined);
let mockRemembered: string | null = null;
let mockUnread = 0;
let mockMyTasks: { id: string }[] = [];

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
jest.mock('../../../lib/orgs/useGroupNotices', () => ({ useGroupNotices: () => ({ unreadCount: mockUnread }) }));
jest.mock('../../../lib/orgs/useMyOpenTasks', () => ({ useMyOpenTasks: () => ({ mine: mockMyTasks, shifts: [], status: 'ready' }) }));
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
jest.mock('../../../components/feature/groups/GroupSummary', () => ({
  GroupSummary: ({ onOpen }: { onOpen: (s: string) => void }) => {
    const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Pressable testID="stub-GroupSummary" onPress={() => onOpen('cuota')} />;
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
    const { findByTestId, getByTestId, getByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByText('Peña')).toBeTruthy();
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
    fireEvent.press(getByTestId('stub-GroupSummary'));
    expect(mockPush).toHaveBeenLastCalledWith('/grupos/Anduela/cuota');
  });

  it('badges the unread notices and my open tasks', async () => {
    mockGroups = [group('Anduela')];
    mockUnread = 2;
    mockMyTasks = [{ id: 't1' }];
    const { findByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByTestId('group-section-avisos-badge')).toBeTruthy();
    expect(getByTestId('group-section-tareas-badge')).toBeTruthy();
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
    const { findByTestId, getByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByText('Peña')).toBeTruthy();
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
