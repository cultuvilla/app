import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ProfileScreen from '../perfil';

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
  getPersonByUserId: jest.fn(),
  getPersonsByCreator: jest.fn().mockResolvedValue([]),
  updatePerson: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadUserPhoto: jest.fn().mockResolvedValue('https://photo.test/new.jpg'),
  uploadPersonImage: jest.fn().mockResolvedValue('https://photo.test/new.jpg'),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  getEventsByOrganizer: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/newsService', () => ({
  getNewsPostsByOrganizer: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/registrationService', () => ({
  getUserRegistrationsAcrossEvents: jest.fn().mockResolvedValue([]),
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
}));
// Stable references: ProfileScreen's `load` is a useCallback keyed on `user`
// and `activeMunicipalityId`, so returning fresh objects each render would
// retrigger its effect in an infinite loop.
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

describe('ProfileScreen — mis pueblos', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the user memberships on mount', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    const villageMemberService = require('@cultuvilla/shared/services/villageMemberService');
    (personService.getPersonByUserId as jest.Mock).mockResolvedValue(null);

    render(<ProfileScreen />);

    await waitFor(() => {
      expect(villageMemberService.getUserMemberships).toHaveBeenCalledWith('uid-1');
    });
  });
});

describe('ProfileScreen — eventos gestionados', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the events created by the user on mount', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    const eventService = require('@cultuvilla/shared/services/eventService');
    (personService.getPersonByUserId as jest.Mock).mockResolvedValue(null);

    render(<ProfileScreen />);

    await waitFor(() => {
      expect(eventService.getEventsByOrganizer).toHaveBeenCalledWith('uid-1');
    });
  });
});

describe('ProfileScreen — Grupos & Peñas', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    mockProfile.activeMunicipalityId = null;
  });

  function seedActiveMunicipalityWith(
    orgs: { id: string; name: string; type: string; images: string[]; villageSlug: string }[],
    memberships: { orgId: string; role: 'admin' | 'member' }[],
  ) {
    mockProfile.activeMunicipalityId = 'mun-1';
    const personService = require('@cultuvilla/shared/services/personService');
    const orgService = require('@cultuvilla/shared/services/organizationService');
    const orgMemberService = require('@cultuvilla/shared/services/orgMemberService');
    (personService.getPersonByUserId as jest.Mock).mockResolvedValue(null);
    (orgService.getOrganizationsByMunicipality as jest.Mock).mockResolvedValue(orgs);
    (orgMemberService.getOrgMembershipsByUserInMunicipality as jest.Mock).mockResolvedValue(
      memberships,
    );
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
    const orgMemberService = require('@cultuvilla/shared/services/orgMemberService');
    const { queryByText } = render(<ProfileScreen />);
    // Wait for the membership lookup (the last step of load) so the
    // conditional render has settled before asserting the sections are gone.
    await waitFor(() => {
      expect(orgMemberService.getOrgMembershipsByUserInMunicipality).toHaveBeenCalled();
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
  beforeEach(() => jest.clearAllMocks());

  it('uploads to the user-scoped path and persists photoURL on the person', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    const imageService = require('@cultuvilla/shared/services/imageService');
    const images = require('../../../lib/images');
    (personService.getPersonByUserId as jest.Mock).mockResolvedValue(SELF_PERSON);
    (images.pickImageAsBlob as jest.Mock).mockResolvedValue(PICKED_IMAGE);

    const { getByTestId } = render(<ProfileScreen />);

    // Wait for the initial load to populate selfPerson. The self variant passes
    // the viewer uid so the owner's own private persona still resolves.
    await waitFor(() => {
      expect(personService.getPersonByUserId).toHaveBeenCalledWith('uid-1', 'uid-1');
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
