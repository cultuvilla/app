import { Image } from 'expo-image';
import { render, waitFor } from '@testing-library/react-native';
import UserProfileScreen from '../[uid]';
import { resetWatchers, setWatched, watchersOf } from '../../../test/watchers';

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
  watchPersonByUserId: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('person'),
  watchPersonsByCreator: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('personas'),
  // The screen's own header name.
  getPersonByUserId: jest.fn().mockResolvedValue(null),
  updatePerson: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  watchEventsByOrganizer: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('events'),
}));
jest.mock('@cultuvilla/shared/services/newsService', () => ({
  watchNewsPostsByOrganizer: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('news'),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  watchOrganizationsByMunicipality: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('villageOrgs'),
}));
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  watchOrgMembershipsByUser: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('orgMemberships'),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  watchUserMemberships: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('memberships'),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  watchMunicipalitiesByIds: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('municipalities'),
  getVillagesWhereAmbassador: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadUserPhoto: jest.fn(),
}));
jest.mock('../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('../../../lib/firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, fn: () => unknown) => fn(),
  reportFirestoreError: jest.fn(),
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
  resetWatchers();
  setWatched('person', OTHER_PERSON);
  setWatched('personas', permissionDenied());
  setWatched('events', [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]);
  setWatched('news', []);
  // A denied section degrades on its own and never blanks the card.
  setWatched('memberships', permissionDenied());
  for (const name of ['villageOrgs', 'orgMemberships', 'municipalities']) {
    setWatched(name, []);
  }
});

async function renderScreen() {
  const screen = render(<UserProfileScreen />);
  await waitFor(() => expect(watchersOf('events')).toHaveLength(1));
  return screen;
}

describe('/user/[uid]', () => {
  it("never asks for a stranger's personas", async () => {
    await renderScreen();
    expect(watchersOf('personas')).toHaveLength(0);
  });

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
