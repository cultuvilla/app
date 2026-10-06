import { Image } from 'expo-image';
import { render, waitFor } from '@testing-library/react-native';
import UserProfileScreen from '../[uid]';

// Regression, screen level: tapping a villager opened /user/[uid] and the card
// came up empty — placeholder avatar, no photo, dashes for every stat. The
// profile load asked for the viewed user's personas, which the persons read
// rule denies to anyone but their creator, and the rejection took the persona
// and event reads down with it. This suite drives the screen with that denial
// in place and requires the photo and the counts to render anyway.

const VIEWED = 'uid-2';
const OTHER_PERSON = {
  id: 'person-2',
  userId: VIEWED,
  createdBy: VIEWED,
  givenName: 'Lucía',
  middleNames: [],
  firstSurname: 'Vecina',
  secondSurname: null,
  nickname: null,
  photoURL: 'https://photo.test/lucia.jpg',
  biography: null,
  municipalityLinks: [],
};

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@cultuvilla/shared/services/userService', () => ({
  getPublicProfile: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: jest.fn(),
  getPersonsByCreator: jest.fn(),
  updatePerson: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  getEventsByOrganizer: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/newsService', () => ({
  getNewsPostsByOrganizer: jest.fn().mockResolvedValue([]),
  getApprovedNewsPostsByOrganizer: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  getOrganizationsByMunicipality: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  getOrgMembershipsByUserInMunicipality: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getUserMemberships: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: jest.fn().mockResolvedValue(null),
  getVillagesWhereAmbassador: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadUserPhoto: jest.fn(),
}));
jest.mock('../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('../../../lib/firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, fn: () => unknown) => fn(),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ uid: 'uid-2' }),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string) => k }),
}));

import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import {
  getPersonByUserId,
  getPersonsByCreator,
} from '@cultuvilla/shared/services/personService';
import { getEventsByOrganizer } from '@cultuvilla/shared/services/eventService';

function permissionDenied() {
  return Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getPublicProfile as jest.Mock).mockResolvedValue({
    id: VIEWED,
    email: 'l@v.test',
    displayName: 'Lucía Vecina',
    activeMunicipalityId: 'muni-1',
    personId: 'person-2',
  });
  (getPersonByUserId as jest.Mock).mockResolvedValue(OTHER_PERSON);
  (getPersonsByCreator as jest.Mock).mockRejectedValue(permissionDenied());
  (getEventsByOrganizer as jest.Mock).mockResolvedValue([{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]);
});

async function renderScreen() {
  const screen = render(<UserProfileScreen />);
  await waitFor(() => expect(getEventsByOrganizer as jest.Mock).toHaveBeenCalled());
  return screen;
}

describe('/user/[uid]', () => {
  it('shows the viewed villager photo', async () => {
    const screen = await renderScreen();
    await waitFor(() => {
      // Remote images render through <RemoteImage> onto expo-image, whose
      // `source` prop is normalized into an array of sources.
      const uris = screen
        .UNSAFE_getAllByType(Image)
        .flatMap((n) => (Array.isArray(n.props.source) ? n.props.source : [n.props.source]))
        .map((s: { uri?: string } | undefined) => s?.uri);
      expect(uris).toContain(OTHER_PERSON.photoURL);
    });
  });

  it('shows their name', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getAllByText('Lucía Vecina').length).toBeGreaterThan(0));
  });

  it('shows their event count instead of an empty stat', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
    expect(screen.queryByText('—')).toBeNull();
  });
});
