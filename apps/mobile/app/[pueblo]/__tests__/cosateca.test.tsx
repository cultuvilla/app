import { fireEvent, render } from '@testing-library/react-native';
import VillageCosatecaScreen from '../cosateca';

const mockPush = jest.fn();
let mockCosas: unknown[] = [];
let mockUser: { uid: string } | null = { uid: 'u1' };
const mockUseWatch = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({ watchVillageCosas: jest.fn() }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../../lib/navigation/VillageRouteGate', () => ({
  useVillageRoute: () => ({ municipalityId: 'm1', slug: 'anaya', name: 'Anaya' }),
  withVillageRoute: (Screen: () => unknown) => Screen,
}));
jest.mock('../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string, key: string | null) => {
    mockUseWatch(label, key);
    return { data: key ? mockCosas : undefined, status: 'ready' };
  },
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="screen-title">{title}</Text>;
  },
}));

const cosa = (id: string, orgId: string, ownerName: string, status = 'available') => ({
  id, orgId, ownerName, ownerUid: null, title: id, category: 'otros', kind: 'prestamo', status, heldBy: null, imageURL: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { uid: 'u1' };
  mockCosas = [cosa('llave', 'ayto', 'Ayuntamiento'), cosa('bici', 'pena', 'Peña', 'given')];
});

describe('Cosateca del pueblo', () => {
  it("lists every group's open cosas under the name of who offers them, and opens one", () => {
    const { getByTestId, queryByTestId } = render(<VillageCosatecaScreen />);
    expect(getByTestId('cosa-row-llave')).toHaveTextContent(/Ayuntamiento/);
    expect(queryByTestId('cosa-row-bici')).toBeNull();
    fireEvent.press(getByTestId('cosa-row-llave'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/ayto/cosa/llave');
  });

  it('reads nothing for a guest, who sees the empty line', () => {
    mockUser = null;
    const { getByTestId } = render(<VillageCosatecaScreen />);
    expect(mockUseWatch).toHaveBeenCalledWith('cosateca:watchVillageCosas', null);
    expect(getByTestId('village-cosateca')).toHaveTextContent('groups.cosateca.village.empty');
  });
});
