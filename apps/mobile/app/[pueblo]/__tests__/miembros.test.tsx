import { render, waitFor } from '@testing-library/react-native';
import VillageMembersScreen from '../miembros';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { isVillageMember } from '@cultuvilla/shared/services/villageMemberService';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa' }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT:{href}</Text>;
  },
}));
// ScreenHeader reads safe-area insets; provide them without a SafeAreaProvider.
jest.mock('../../../lib/navigation/VillageRouteGate');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({ useEntityCapabilities: jest.fn() }));
jest.mock('../../../lib/auth/useIsAppAdmin', () => ({ useIsAppAdmin: () => ({ isAppAdmin: false, loading: false }) }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  isVillageMember: jest.fn(),
}));
jest.mock('../../../components/feature/MembersList', () => ({
  MembersList: () => {
    const { Text } = require('react-native');
    return <Text>MEMBERS_LIST</Text>;
  },
}));

const mockCaps = useEntityCapabilities as jest.Mock;
const mockIsMember = isVillageMember as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('VillageMembersScreen (members-only)', () => {
  it('a member sees the roster', async () => {
    mockCaps.mockReturnValue({ canManage: false, canApprove: false, uid: 'u1', loading: false });
    mockIsMember.mockResolvedValue(true);
    const { findByText } = render(<VillageMembersScreen />);
    expect(await findByText('MEMBERS_LIST')).toBeTruthy();
  });

  it('a non-member is redirected back to the village', async () => {
    mockCaps.mockReturnValue({ canManage: false, canApprove: false, uid: 'u1', loading: false });
    mockIsMember.mockResolvedValue(false);
    const { findByText, queryByText } = render(<VillageMembersScreen />);
    expect(await findByText('REDIRECT:/villa')).toBeTruthy();
    expect(queryByText('MEMBERS_LIST')).toBeNull();
  });

  it('an admin who is not a member can still view', async () => {
    mockCaps.mockReturnValue({ canManage: true, canApprove: true, uid: 'u1', loading: false });
    mockIsMember.mockResolvedValue(false);
    const { findByText } = render(<VillageMembersScreen />);
    expect(await findByText('MEMBERS_LIST')).toBeTruthy();
  });

  it('waits for the membership check before deciding', async () => {
    mockCaps.mockReturnValue({ canManage: false, canApprove: false, uid: 'u1', loading: false });
    mockIsMember.mockResolvedValue(true);
    const { queryByText } = render(<VillageMembersScreen />);
    // Before the async check resolves, neither the roster nor a redirect shows.
    expect(queryByText('MEMBERS_LIST')).toBeNull();
    expect(queryByText('REDIRECT:/villa')).toBeNull();
    await waitFor(() => expect(queryByText('MEMBERS_LIST')).toBeTruthy());
  });
});
