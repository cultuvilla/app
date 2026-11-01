import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import { UserMenuModal } from '../UserMenuModal';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => key }),
}));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-1', email: 'ana@test.com' },
    profile: { email: 'ana@test.com', displayName: 'Ana Gil' },
    signOut: mockSignOut,
  }),
}));
jest.mock('../../../lib/auth/useIsAppAdmin', () => ({
  useIsAppAdmin: () => ({ isAppAdmin: false }),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: jest.fn().mockResolvedValue(null),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getUserMemberships: jest.fn().mockResolvedValue([]),
}));

describe('UserMenuModal menu actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('navigates to /ajustes when tapping Ajustes', async () => {
    const { getByText } = render(<UserMenuModal visible onClose={jest.fn()} />);
    fireEvent.press(getByText('menu.settings'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/ajustes'));
  });

  it('shares the Cultuvilla website', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });
    const { getByText } = render(<UserMenuModal visible onClose={jest.fn()} />);

    fireEvent.press(getByText('menu.shareApp'));

    await waitFor(() =>
      expect(shareSpy).toHaveBeenCalledWith({ message: 'https://cultuvilla.es' }),
    );
    shareSpy.mockRestore();
  });

  it('does not show the obsolete requests entry', () => {
    const { queryByText } = render(<UserMenuModal visible onClose={jest.fn()} />);

    expect(queryByText('menu.myRequests')).toBeNull();
  });

  it('does not sign out until the user confirms', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = render(<UserMenuModal visible onClose={jest.fn()} />);

    fireEvent.press(getByText('menu.signOut'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('returns to the explore tab after confirming the sign-out', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => buttons?.[1]?.onPress?.());
    const { getByText } = render(<UserMenuModal visible onClose={jest.fn()} />);

    fireEvent.press(getByText('menu.signOut'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    alertSpy.mockRestore();
  });

  it('renders the menu title with the larger green heading style', () => {
    const { getByText } = render(<UserMenuModal visible onClose={jest.fn()} />);
    const title = getByText('menu.title');

    expect(title.props.className).toMatch(/text-h1/);
    expect(title.props.className).toMatch(/text-accent/);
  });
});
