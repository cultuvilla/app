import { render, within } from '@testing-library/react-native';
import CommunityScreen from '../comunidad';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';

// ScreenHeader reads safe-area insets; provide them without a SafeAreaProvider.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa' }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT:{href}</Text>;
  },
}));
jest.mock('../../../lib/navigation/VillageRouteGate');
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({ useEntityCapabilities: jest.fn() }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../components/feature/CommunitySettingsEditor', () => ({
  CommunitySettingsEditor: ({ afterFiestas }: { afterFiestas?: React.ReactNode }) => {
    const { Text, View } = require('react-native');
    return (
      <View testID="community-editor">
        <Text>COMMUNITY_EDITOR</Text>
        {afterFiestas}
      </View>
    );
  },
}));

const mockCaps = useEntityCapabilities as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('CommunityScreen (role-gated)', () => {
  it('an organizer sees the editor', () => {
    mockCaps.mockReturnValue({ canManage: true, canApprove: true, uid: 'u1', loading: false });
    const { getByText } = render(<CommunityScreen />);
    expect(getByText('COMMUNITY_EDITOR')).toBeTruthy();
  });

  it('puts the fiestas summary entry inside the editor, not in the sticky footer', () => {
    mockCaps.mockReturnValue({ canManage: true, canApprove: true, uid: 'u1', loading: false });
    const { getByTestId } = render(<CommunityScreen />);
    expect(within(getByTestId('community-editor')).getByTestId('community-wrapped')).toBeTruthy();
  });

  it('a villager is redirected back to the village', () => {
    mockCaps.mockReturnValue({ canManage: false, canApprove: false, uid: 'u1', loading: false });
    const { getByText, queryByText } = render(<CommunityScreen />);
    expect(getByText('REDIRECT:/villa')).toBeTruthy();
    expect(queryByText('COMMUNITY_EDITOR')).toBeNull();
  });
});
