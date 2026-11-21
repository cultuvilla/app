import { fireEvent, render, waitFor } from '@testing-library/react-native';
import MyVillagesScreen from '../mis-pueblos';
import { routes } from '../../lib/navigation/routes';

// Regression (device QA, offline): picking a village in Mis pueblos spun
// forever. The screen awaited the users/{uid} write, and on the native SDK an
// offline write resolves only when the server acknowledges it — though the
// cache has it at once. The switch must not wait on that ack.

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() },
}));

const mockSwitchActiveVillage = jest.fn();
const mockUser = { uid: 'uid-1' };
const mockProfile = { activeMunicipalityId: 'm-a' };
jest.mock('../../lib/auth/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    refreshProfile: jest.fn(() => new Promise(() => {})),
    switchActiveVillage: mockSwitchActiveVillage,
  }),
}));
jest.mock('../../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));

// Never acknowledged: what an offline write looks like on the native SDK.
jest.mock('@cultuvilla/shared/services/userService', () => ({
  setActiveMunicipality: jest.fn(() => new Promise(() => {})),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getUserMemberships: jest.fn().mockResolvedValue([
    { municipalityId: 'm-a', role: 'user' },
    { municipalityId: 'm-b', role: 'user' },
  ]),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: jest.fn(async (id: string) => ({ id, name: id === 'm-a' ? 'Aldea' : 'Berrueco' })),
}));
jest.mock('@cultuvilla/shared/models/municipality', () => ({
  escudoThumbDisplayUrl: () => null,
  villageTitle: () => 'member',
}));
jest.mock('../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('../../components/primitives/Escudo', () => ({ Escudo: () => null }));

describe('Mis pueblos — switching village offline', () => {
  beforeEach(() => jest.clearAllMocks());

  it('switches and opens Mi pueblo without waiting for the write to be acknowledged', async () => {
    const { findByText } = render(<MyVillagesScreen />);
    fireEvent.press(await findByText('Berrueco'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(routes.myVillage));
    expect(mockSwitchActiveVillage).toHaveBeenCalledWith('m-b');
  });
});
