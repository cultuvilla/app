import { act, render } from '@testing-library/react-native';
import ProfileScreen from '../perfil';
import { routes } from '../../../lib/navigation/routes';

// Regression (device QA, offline): tapping a village on the profile's village
// card did nothing. The screen awaited the users/{uid} write, which on the
// native SDK offline resolves only on the server's ack. The switch must not
// wait on it.

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() },
}));

const mockSwitchActiveVillage = jest.fn();
const mockUser = { uid: 'uid-1', email: 'a@b.test' };
const mockProfile = { activeMunicipalityId: 'm-a', displayName: 'A' };
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    refreshProfile: jest.fn(() => new Promise(() => {})),
    switchActiveVillage: mockSwitchActiveVillage,
  }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/userService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/userService')>(
      '@cultuvilla/shared/services/userService',
      () => ({
        setActiveMunicipality: jest.fn(() => new Promise(() => {})),
      }),
    ),
);
jest.mock('../../../components/layout/AppHeader', () => ({ AppHeader: () => null }));

let mockOnSelectVillage: ((id: string) => unknown) | undefined;
jest.mock('../../../components/feature/profile/ProfileView', () => ({
  ProfileView: (props: { onSelectVillage?: (id: string) => unknown }) => {
    mockOnSelectVillage = props.onSelectVillage;
    return null;
  },
}));

describe('Perfil — switching village offline', () => {
  it('switches and opens Mi pueblo without waiting for the write to be acknowledged', async () => {
    render(<ProfileScreen />);
    await act(async () => {
      void mockOnSelectVillage?.('m-b');
    });

    expect(mockReplace).toHaveBeenCalledWith(routes.myVillage);
    expect(mockSwitchActiveVillage).toHaveBeenCalledWith('m-b');
  });
});
