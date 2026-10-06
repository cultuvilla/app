import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ProfileScreen from '../perfil';
import { resetWatchers, setWatched, watchersOf } from '../../../test/watchers';

// Regression: changing the profile photo failed with FirebaseError
// storage/unauthorized on `persons/<id>/photos/<id>.jpeg`. The screen uploaded
// to the person-scoped storage path (whose rule needs a cross-service
// firestore.get that doesn't resolve), instead of the user-scoped path the
// onboarding flow already uses — and it never persisted the resulting URL.
// onChangePhoto must mirror onboarding: uploadUserPhoto(uid) + updatePerson.

const SELF_PERSON = {
  id: 'seed-real-user-data-1-person-alvaro',
  userId: 'uid-1',
  createdBy: 'seed',
  givenName: 'Alvaro',
  middleNames: [],
  firstSurname: 'Gil',
  secondSurname: null,
  nickname: null,
  photoURL: null,
};

const PICKED_IMAGE = { blob: {}, filename: 'pic.jpg', contentType: 'image/jpeg' };

jest.mock('@cultuvilla/shared/services/personService', () => ({
  watchPersonByUserId: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('person'),
  watchPersonsByCreator: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('personas'),
  updatePerson: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadUserPhoto: jest.fn().mockResolvedValue('https://photo.test/new.jpg'),
  uploadPersonImage: jest.fn().mockResolvedValue('https://photo.test/new.jpg'),
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
jest.mock('@cultuvilla/shared/services/userService', () => ({
  setActiveMunicipality: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/models/municipality', () => ({
  escudoThumbDisplayUrl: jest.fn().mockReturnValue(null),
}));
jest.mock('../../../lib/images', () => ({
  pickImageAsBlob: jest.fn(),
}));
jest.mock('../../../lib/firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, fn: () => unknown) => fn(),
  reportFirestoreError: jest.fn(),
}));
// Stable references for the auth context.
const mockUser = { uid: 'uid-1', email: 'a@b.test', displayName: null };
const mockProfile: { activeMunicipalityId: string | null } = { activeMunicipalityId: null };
const mockRefreshProfile = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile, refreshProfile: mockRefreshProfile }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key} ${Object.values(vars).join(' ')}` : key,
  }),
}));
jest.mock('../../../lib/appVersion', () => ({
  getRunningVersion: () => '1.4.0',
  getRunningBuild: () => '42',
}));
jest.mock('../../../components/layout/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('../../../components/feature/profile/ProfileStatsRow', () => ({
  ProfileStatsRow: ({
    stats,
  }: {
    stats: { label: string; value: number | null }[];
  }) => {
    const { Text, View } = require('react-native');
    return (
      <View>
        {stats.map((stat) => (
          <Text key={stat.label}>{`${stat.label}:${stat.value ?? '-'}`}</Text>
        ))}
      </View>
    );
  },
}));
jest.mock('../../../components/feature/profile/PersonaScroll', () => ({
  PersonaScroll: () => null,
}));
// Mock the village section primitives the profile reuses for its org scrolls:
// a Section that renders its title + children, and an EntityCard that exposes
// its label and onPress so we can assert routing. ACCENT is also consumed.
jest.mock('../../../components/feature/VillageSections', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    ACCENT: '#bb5d3a',
    Section: ({ title, children }: { title: string; children?: unknown }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
    EntityCard: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable testID={`org-card-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});
jest.mock('../../../components/feature/profile/VillagesScroll', () => ({
  VillagesScroll: () => null,
}));
jest.mock('../../../components/feature/profile/ManagedEventsScroll', () => ({
  ManagedEventsScroll: () => null,
}));
jest.mock('../../../components/feature/profile/ProfileSectionHeader', () => ({
  ProfileSectionHeader: () => null,
}));
// Stub the header so we can trigger onChangePhoto via a plain button.
jest.mock('../../../components/feature/profile/ProfileHeader', () => {
  const { Pressable, Text } = require('react-native');
  return {
    ProfileHeader: ({ onPressAvatar }: { onPressAvatar?: () => void }) => (
      <Pressable testID="change-photo" onPress={onPressAvatar}>
        <Text>avatar</Text>
      </Pressable>
    ),
  };
});

function answerEmpty() {
  resetWatchers();
  setWatched('person', null);
  for (const name of ['personas', 'events', 'news', 'villageOrgs', 'orgMemberships', 'memberships', 'municipalities']) {
    setWatched(name, []);
  }
}

describe('ProfileScreen — mis pueblos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answerEmpty();
  });

  it('watches the user memberships on mount', async () => {
    render(<ProfileScreen />);

    await waitFor(() => {
      expect(watchersOf('memberships')[0]?.args).toEqual(['uid-1']);
    });
  });
});

describe('ProfileScreen — eventos gestionados', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answerEmpty();
  });

  it('watches the events created by the user on mount', async () => {
    render(<ProfileScreen />);

    await waitFor(() => {
      expect(watchersOf('events')[0]?.args).toEqual(['uid-1']);
    });
  });
});

describe('ProfileScreen — Grupos & Peñas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answerEmpty();
  });
  afterEach(() => {
    mockProfile.activeMunicipalityId = null;
  });

  function seedActiveMunicipalityWith(
    orgs: { id: string; name: string; type: string; images: string[]; villageSlug: string }[],
    memberships: { orgId: string; role: 'admin' | 'member' }[],
  ) {
    mockProfile.activeMunicipalityId = 'mun-1';
    setWatched('villageOrgs', orgs.map((o) => ({ commentCount: 0, ...o })));
    setWatched('orgMemberships', memberships);
  }

  it('shows each section title only when the user belongs to that kind of org', async () => {
    seedActiveMunicipalityWith(
      [
        { id: 'org-aso', name: 'Asociación Cultural', type: 'asociación', images: [], villageSlug: 'villa' },
        { id: 'org-pena', name: 'Peña El Bote', type: 'peña', images: [], villageSlug: 'villa' },
      ],
      [
        { orgId: 'org-aso', role: 'member' },
        { orgId: 'org-pena', role: 'member' },
      ],
    );
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => {
      expect(getByText('profile.gruposSection.title')).toBeTruthy();
      expect(getByText('profile.peñasSection.title')).toBeTruthy();
    });
  });

  it('counts a peña membership in the Grupos profile stat', async () => {
    seedActiveMunicipalityWith(
      [{ id: 'org-pena', name: 'Peña El Bote', type: 'peña', images: [], villageSlug: 'villa' }],
      [{ orgId: 'org-pena', role: 'member' }],
    );

    const { getByText } = render(<ProfileScreen />);

    await waitFor(() => {
      expect(getByText('profile.stats.grupos:1')).toBeTruthy();
    });
  });

  it('hides both sections when the user belongs to no orgs', async () => {
    seedActiveMunicipalityWith([], []);
    const { queryByText } = render(<ProfileScreen />);
    // Wait for the membership listener so the conditional render has settled
    // before asserting the sections are gone.
    await waitFor(() => {
      expect(watchersOf('orgMemberships')).toHaveLength(1);
    });
    expect(queryByText('profile.gruposSection.title')).toBeNull();
    expect(queryByText('profile.peñasSection.title')).toBeNull();
  });

  it('hides the Peñas section when the user only belongs to a non-peña org', async () => {
    seedActiveMunicipalityWith(
      [{ id: 'org-aso', name: 'Asociación Cultural', type: 'asociación', images: [], villageSlug: 'villa' }],
      [{ orgId: 'org-aso', role: 'member' }],
    );
    const { getByText, queryByText } = render(<ProfileScreen />);
    await waitFor(() => {
      expect(getByText('profile.gruposSection.title')).toBeTruthy();
    });
    expect(queryByText('profile.peñasSection.title')).toBeNull();
  });

  it('routes a peña membership to the Peñas scroll and a non-peña to Grupos, each linking to its village-first org page', async () => {
    seedActiveMunicipalityWith(
      [
        { id: 'org-aso', name: 'Asociación Cultural', type: 'asociación', images: [], villageSlug: 'villa' },
        { id: 'org-pena', name: 'Peña El Bote', type: 'peña', images: [], villageSlug: 'villa' },
        { id: 'org-other', name: 'No soy miembro', type: 'peña', images: [], villageSlug: 'villa' },
      ],
      [
        { orgId: 'org-aso', role: 'admin' },
        { orgId: 'org-pena', role: 'member' },
      ],
    );
    const expoRouter = require('expo-router');

    const { getByTestId, queryByTestId } = render(<ProfileScreen />);

    await waitFor(() => {
      expect(getByTestId('org-card-Asociación Cultural')).toBeTruthy();
      expect(getByTestId('org-card-Peña El Bote')).toBeTruthy();
    });
    // Orgs the user does not belong to never render.
    expect(queryByTestId('org-card-No soy miembro')).toBeNull();

    fireEvent.press(getByTestId('org-card-Asociación Cultural'));
    expect(expoRouter.router.push).toHaveBeenCalledWith('/villa/entidad/asociacion-cultural_org-aso');

    fireEvent.press(getByTestId('org-card-Peña El Bote'));
    expect(expoRouter.router.push).toHaveBeenCalledWith('/villa/entidad/pena-el-bote_org-pena');
  });
});

describe('ProfileScreen — change photo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answerEmpty();
  });

  it('uploads to the user-scoped path and persists photoURL on the person', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    const imageService = require('@cultuvilla/shared/services/imageService');
    const images = require('../../../lib/images');
    setWatched('person', SELF_PERSON);
    (images.pickImageAsBlob as jest.Mock).mockResolvedValue(PICKED_IMAGE);

    const { getByTestId } = render(<ProfileScreen />);

    // The self variant passes the viewer uid so the owner's own private
    // persona still resolves.
    await waitFor(() => {
      expect(watchersOf('person')[0]?.args).toEqual(['uid-1', 'uid-1']);
    });

    await act(async () => {
      fireEvent.press(getByTestId('change-photo'));
    });

    await waitFor(() => {
      expect(imageService.uploadUserPhoto).toHaveBeenCalledWith('uid-1', PICKED_IMAGE);
    });
    expect(imageService.uploadPersonImage).not.toHaveBeenCalled();
    expect(personService.updatePerson).toHaveBeenCalledWith(SELF_PERSON.id, {
      photoURL: 'https://photo.test/new.jpg',
    });
  });
});
