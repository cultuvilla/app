import { render } from '@testing-library/react-native';

// The body is exercised in its own suite; here we only verify the screen wires
// the village name into the header when pushed in-app (has a back stack) and
// redirects a cold share-link entry (no back stack) into the tab shell.
jest.mock('../../../lib/useVillageHome', () => ({
  useVillageHome: () => ({
    coreLoading: false,
    coreError: null,
    village: {
      id: 'm1',
      name: 'Anaya',
      province: 'Segovia',
      communityActive: true,
      community: { organizerId: null },
    },
    villageAdmin: false,
    isMember: true,
    barrios: [],
    places: [],
    organizations: [],
    events: [],
    peopleCount: 1,
    pendingOrganizerRequest: false,
    reload: jest.fn(),
  }),
}));
jest.mock('../../../components/feature/VillageHomeBody', () => ({
  VillageHomeBody: () => null,
}));
jest.mock('../../../lib/navigation/VillageRouteGate');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRedirect = jest.fn();
const mockCanGoBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa' }),
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: (href: string) => mockReplace(href),
    canGoBack: () => mockCanGoBack(),
  },
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string) => k }),
}));

const mockUseAuth = jest.fn();
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
const mockActivate = jest.fn();
jest.mock('../../../lib/village/GuestActiveVillageContext', () => ({
  useGuestActiveVillage: () => ({ guestVillageId: null, activate: mockActivate }),
}));

import VillageHome from '../index';

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders the village name in the header when pushed in-app (has a back stack)', () => {
  mockCanGoBack.mockReturnValue(true);
  mockUseAuth.mockReturnValue({ user: { uid: 'uid-1' } });
  const { getByText } = render(<VillageHome />);
  expect(getByText('Anaya')).toBeTruthy();
  expect(mockRedirect).not.toHaveBeenCalled();
});

it('keeps the back-navigable screen for a guest browsing in-app (has a back stack)', () => {
  mockCanGoBack.mockReturnValue(true);
  mockUseAuth.mockReturnValue({ user: null });
  render(<VillageHome />);
  expect(mockActivate).not.toHaveBeenCalled();
  expect(mockRedirect).not.toHaveBeenCalled();
});

it('activates the shared village and redirects a guest cold entry into the tab shell', () => {
  mockCanGoBack.mockReturnValue(false);
  mockUseAuth.mockReturnValue({ user: null });
  render(<VillageHome />);
  expect(mockActivate).toHaveBeenCalledWith('m1');
  expect(mockRedirect).toHaveBeenCalledWith('/(tabs)/mi-pueblo?villageId=m1');
});

it('redirects a signed-in cold entry into the tab shell without switching their home', () => {
  mockCanGoBack.mockReturnValue(false);
  mockUseAuth.mockReturnValue({ user: { uid: 'uid-1' } });
  render(<VillageHome />);
  // No activate + no profile write: the shared village rides the query param,
  // so the member's activeMunicipalityId is untouched.
  expect(mockActivate).not.toHaveBeenCalled();
  expect(mockRedirect).toHaveBeenCalledWith('/(tabs)/mi-pueblo?villageId=m1');
});
