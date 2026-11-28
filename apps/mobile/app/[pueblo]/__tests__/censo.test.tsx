import { render } from '@testing-library/react-native';
import CensoScreen from '../censo';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';

let mockParams: Record<string, string> = { pueblo: 'villa' };
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('../../../lib/navigation/VillageRouteGate');
// ScreenHeader reads safe-area insets; provide them without a SafeAreaProvider.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/municipalityService')>(
      '@cultuvilla/shared/services/municipalityService',
      () => ({
        getMunicipality: jest.fn(() => Promise.resolve({ name: 'Matabuena' } as never)),
      }),
    ),
);
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({ useEntityCapabilities: jest.fn() }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../components/feature/CensoSchemaEditor', () => ({
  CensoSchemaEditor: () => {
    const { Text } = require('react-native');
    return <Text>SCHEMA_EDITOR</Text>;
  },
}));
jest.mock('../../../components/feature/CensoAnswers', () => ({
  CensoAnswers: () => {
    const { Text } = require('react-native');
    return <Text>ANSWER_FORM</Text>;
  },
}));

const mockCaps = useEntityCapabilities as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { pueblo: 'villa' };
});

describe('CensoScreen (role-mode)', () => {
  it('an organizer lands in the schema editor', () => {
    mockCaps.mockReturnValue({ canManage: true, canApprove: true, uid: 'u1', loading: false });
    const { getByText, queryByText } = render(<CensoScreen />);
    expect(getByText('SCHEMA_EDITOR')).toBeTruthy();
    expect(queryByText('ANSWER_FORM')).toBeNull();
  });

  it('a villager lands in the answer form', () => {
    mockCaps.mockReturnValue({ canManage: false, canApprove: false, uid: 'u1', loading: false });
    const { getByText, queryByText } = render(<CensoScreen />);
    expect(getByText('ANSWER_FORM')).toBeTruthy();
    expect(queryByText('SCHEMA_EDITOR')).toBeNull();
  });

  it('an organizer with mode=fill lands in the answer form', () => {
    mockParams = { pueblo: 'villa', mode: 'fill' };
    mockCaps.mockReturnValue({ canManage: true, canApprove: true, uid: 'u1', loading: false });
    const { getByText, queryByText } = render(<CensoScreen />);
    expect(getByText('ANSWER_FORM')).toBeTruthy();
    expect(queryByText('SCHEMA_EDITOR')).toBeNull();
  });
});
