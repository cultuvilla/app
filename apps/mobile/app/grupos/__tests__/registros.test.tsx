import { render } from '@testing-library/react-native';
import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import GroupRecordsDoorScreen from '../[grupo]/registros/[puerta]';

let mockGroups: MyGroup[] = [];
let mockParams: { grupo?: string; puerta?: string } = {};
const mockRedirect = jest.fn((_props: { href: string }) => null);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="screen-title">{title}</Text>;
  },
}));
function mockDoor(name: string) {
  return ({ orgId }: { orgId: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="door-body">{`${orgId}:${name}`}</Text>;
  };
}
jest.mock('../../../components/feature/groups/LibroSocios', () => ({ LibroSocios: mockDoor('libro') }));
jest.mock('../../../components/feature/groups/ActasAdmin', () => ({ ActasAdmin: mockDoor('actas') }));
jest.mock('../../../components/feature/groups/YearSummaryAdmin', () => ({ YearSummaryAdmin: mockDoor('cuentas') }));

function group(id: string, role: 'admin' | 'member', type: 'asociación' | 'ayuntamiento' = 'asociación'): MyGroup {
  return {
    org: { id, ...buildOrganizationData({ name: id, type, municipalityId: 'm', villageSlug: 'v', requestedBy: 'x', status: 'approved' }) },
    role,
  };
}

beforeEach(() => mockRedirect.mockClear());

describe('a Registros door', () => {
  it.each(['libro', 'actas', 'cuentas'])('opens the %s door for an admin', (door) => {
    mockGroups = [group('Anduela', 'admin')];
    mockParams = { grupo: 'Anduela', puerta: door };
    const { getByTestId } = render(<GroupRecordsDoorScreen />);
    expect(getByTestId('screen-title').props.children).toBe(`groups.records.doors.${door}`);
    expect(getByTestId('door-body').props.children).toBe(`Anduela:${door}`);
    expect(getByTestId(`records-door-screen-${door}`)).toBeTruthy();
  });

  it('sends an unknown door back to the folder', () => {
    mockGroups = [group('Anduela', 'admin')];
    mockParams = { grupo: 'Anduela', puerta: 'nada' };
    render(<GroupRecordsDoorScreen />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/grupos/Anduela/registros' });
  });

  it('sends a member who is not an admin back to the group', () => {
    mockGroups = [group('Anduela', 'member')];
    mockParams = { grupo: 'Anduela', puerta: 'libro' };
    render(<GroupRecordsDoorScreen />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/grupos?grupo=Anduela' });
  });
});
