import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import GroupsTabScreen from '../grupos';

let mockGroups: MyGroup[] = [];
const mockRemember = jest.fn().mockResolvedValue(undefined);
let mockRemembered: string | null = null;

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('../../../lib/orgs/lastGroup', () => ({
  ...jest.requireActual<typeof import('../../../lib/orgs/lastGroup')>('../../../lib/orgs/lastGroup'),
  readLastGroupId: () => Promise.resolve(mockRemembered),
  rememberLastGroupId: (id: string) => mockRemember(id),
}));
const mockPush = jest.fn();
let mockParams: { grupo?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../../components/layout/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  watchOrgMembers: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('members'),
}));
function mockStub(name: string) {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { [name]: () => <RNText testID={`stub-${name}`}>{name}</RNText> };
}
jest.mock('../../../components/feature/groups/SocioConsentCard', () => mockStub('SocioConsentCard'));
jest.mock('../../../components/feature/groups/MyPersonasSocios', () => mockStub('MyPersonasSocios'));
jest.mock('../../../components/feature/groups/GroupSettings', () => mockStub('GroupSettings'));
jest.mock('../../../components/feature/groups/MyCuota', () => mockStub('MyCuota'));
jest.mock('../../../components/feature/groups/CuotaAdmin', () => mockStub('CuotaAdmin'));
jest.mock('../../../components/feature/groups/MyTasks', () => mockStub('MyTasks'));
jest.mock('../../../components/feature/groups/TasksAdmin', () => mockStub('TasksAdmin'));
jest.mock('../../../components/feature/groups/GroupNotices', () => mockStub('GroupNotices'));
jest.mock('../../../components/feature/groups/GroupMessagesAdmin', () => mockStub('GroupMessagesAdmin'));
jest.mock('../../../components/feature/groups/RecordsAdmin', () => mockStub('RecordsAdmin'));
jest.mock('../../../components/feature/groups/MyActas', () => mockStub('MyActas'));
jest.mock('../../../components/feature/OrgEventsSection', () => mockStub('OrgEventsSection'));
jest.mock('../../../components/feature/OrgJoinRequests', () => mockStub('OrgJoinRequests'));
jest.mock('../../../components/feature/OrgMembersList', () => mockStub('OrgMembersList'));
jest.mock('../../../components/feature/groups/SociosRoster', () => ({
  SociosRoster: ({ canManage }: { canManage: boolean }) => {
    const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <RNText testID={canManage ? 'stub-SociosRoster-manage' : 'stub-SociosRoster-names'}>roster</RNText>;
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
  mockRemember.mockClear();
});

describe('Grupos tab', () => {
  it('says so when the user has no group left', async () => {
    mockGroups = [];
    const { findByTestId } = render(<GroupsTabScreen />);
    expect(await findByTestId('groups-empty')).toBeTruthy();
  });

  it('shows no switcher with a single group', async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId, queryByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(queryByTestId('group-switcher')).toBeNull();
  });

  it("links to the group's public page", async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId } = render(<GroupsTabScreen />);
    fireEvent.press(await findByTestId('group-open-page'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/v/entidad/'));
  });

  it('reopens the last-used group and remembers a switch', async () => {
    mockGroups = [group('Anduela'), group('Peña')];
    mockRemembered = 'Peña';
    const { findByTestId, getAllByText, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    // Its chip and the home's heading.
    expect(getAllByText('Peña')).toHaveLength(2);
    expect(getAllByText('Anduela')).toHaveLength(1);
    fireEvent.press(getByTestId('group-switcher-Anduela'));
    await waitFor(() => expect(mockRemember).toHaveBeenCalledWith('Anduela'));
  });

  it('a member sees their socio sections but no Gestionar', async () => {
    mockGroups = [group('Anduela')];
    const { findByTestId, queryByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getByTestId('stub-SocioConsentCard')).toBeTruthy();
    expect(getByTestId('stub-MyPersonasSocios')).toBeTruthy();
    expect(getByTestId('stub-MyCuota')).toBeTruthy();
    expect(getByTestId('stub-GroupNotices')).toBeTruthy();
    expect(queryByTestId('stub-GroupMessagesAdmin')).toBeNull();
    expect(queryByTestId('group-manage')).toBeNull();
    expect(queryByTestId('stub-CuotaAdmin')).toBeNull();
    expect(queryByTestId('stub-SociosRoster-names')).toBeNull();
    expect(getByTestId('stub-MyTasks')).toBeTruthy();
    expect(queryByTestId('stub-TasksAdmin')).toBeNull();
    expect(getByTestId('stub-MyActas')).toBeTruthy();
    expect(queryByTestId('stub-RecordsAdmin')).toBeNull();
  });

  it('a member sees the names when the estatutos allow it', async () => {
    mockGroups = [group('Anduela', { sociosListVisible: true })];
    const { findByTestId } = render(<GroupsTabScreen />);
    await findByTestId('stub-SociosRoster-names');
  });

  it('an admin gets the Gestionar section with roster, members and settings', async () => {
    mockGroups = [group('Anduela', { joinPolicy: 'approval' }, 'admin')];
    const { findByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-manage');
    expect(getByTestId('stub-SociosRoster-manage')).toBeTruthy();
    expect(getByTestId('stub-OrgJoinRequests')).toBeTruthy();
    expect(getByTestId('stub-OrgMembersList')).toBeTruthy();
    expect(getByTestId('stub-GroupSettings')).toBeTruthy();
    expect(getByTestId('stub-CuotaAdmin')).toBeTruthy();
    expect(getByTestId('stub-TasksAdmin')).toBeTruthy();
    expect(getByTestId('stub-GroupMessagesAdmin')).toBeTruthy();
    expect(getByTestId('stub-RecordsAdmin')).toBeTruthy();
  });

  it('opens on the group a cuota reminder names, and remembers it', async () => {
    mockGroups = [group('Anduela'), group('Peña')];
    mockRemembered = 'Anduela';
    mockParams = { grupo: 'Peña' };
    const { findByTestId, getAllByText } = render(<GroupsTabScreen />);
    await findByTestId('group-home');
    expect(getAllByText('Peña')).toHaveLength(2);
    expect(mockRemember).toHaveBeenCalledWith('Peña');
  });

  it('an ayuntamiento has no socio roster', async () => {
    mockGroups = [group('Ayto', { type: 'ayuntamiento' }, 'admin')];
    const { findByTestId, queryByTestId, getByTestId } = render(<GroupsTabScreen />);
    await findByTestId('group-manage');
    expect(queryByTestId('stub-SocioConsentCard')).toBeNull();
    expect(queryByTestId('stub-SociosRoster-manage')).toBeNull();
    expect(queryByTestId('stub-GroupSettings')).toBeNull();
    expect(queryByTestId('stub-CuotaAdmin')).toBeNull();
    expect(queryByTestId('stub-MyCuota')).toBeNull();
    expect(queryByTestId('stub-GroupNotices')).toBeNull();
    expect(queryByTestId('stub-RecordsAdmin')).toBeNull();
    expect(getByTestId('stub-OrgMembersList')).toBeTruthy();
    // Tasks are for every org type.
    expect(getByTestId('stub-MyTasks')).toBeTruthy();
    expect(getByTestId('stub-TasksAdmin')).toBeTruthy();
  });
});
