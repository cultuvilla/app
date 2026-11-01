import { render, fireEvent } from '@testing-library/react-native';
import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import GroupSectionScreen from '../[grupo]/[seccion]';

let mockGroups: MyGroup[] = [];
let mockParams: { grupo?: string; seccion?: string } = {};
const mockSetParams = jest.fn();
const mockDismissTo = jest.fn();
const mockRedirect = jest.fn((_props: { href: string }) => null);
const mockRemember = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('../../../lib/orgs/lastGroup', () => ({ rememberLastGroupId: (id: string) => mockRemember(id) }));
jest.mock('expo-router', () => ({
  router: { setParams: (p: unknown) => mockSetParams(p), dismissTo: (h: unknown) => mockDismissTo(h), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="screen-title">{title}</Text>;
  },
}));
jest.mock('../../../components/feature/groups/GroupSectionBody', () => ({
  GroupSectionBody: ({ group, section }: { group: MyGroup; section: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="section-body">{`${group.org.id}:${section}`}</Text>;
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
  mockSetParams.mockClear();
  mockDismissTo.mockClear();
  mockRedirect.mockClear();
});

describe('a group screen', () => {
  it("renders the section of the group it names", () => {
    mockGroups = [group('Anduela')];
    mockParams = { grupo: 'Anduela', seccion: 'cuota' };
    const { getByTestId } = render(<GroupSectionScreen />);
    expect(getByTestId('screen-title').props.children).toBe('groups.sections.cuota');
    expect(getByTestId('section-body').props.children).toBe('Anduela:cuota');
    expect(getByTestId('group-section-screen-cuota')).toBeTruthy();
  });

  it('sends an unknown section back to the tab', () => {
    mockGroups = [group('Anduela')];
    mockParams = { grupo: 'Anduela', seccion: 'nada' };
    render(<GroupSectionScreen />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/(tabs)/grupos' });
  });

  it("sends a member away from a Gestionar screen, to the group's home", () => {
    mockGroups = [group('Anduela')];
    mockParams = { grupo: 'Anduela', seccion: 'cobros' };
    render(<GroupSectionScreen />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/grupos?grupo=Anduela' });
  });

  it('has no bar to change group', () => {
    mockGroups = [group('Anduela'), group('Peña')];
    mockParams = { grupo: 'Anduela', seccion: 'cuota' };
    const { queryByText } = render(<GroupSectionScreen />);
    expect(queryByText('Peña')).toBeNull();
    expect(queryByText('Anduela')).toBeNull();
  });
});
