import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { VillageHomeBody } from '../VillageHomeBody';
import type { VillageHomeState } from '../../../lib/useVillageHome';
import { buildNewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import { buildPlaceData } from '@cultuvilla/shared/models/municipality';

const mockRefreshProfile = jest.fn(async () => undefined);
let mockUser: { uid: string } | null = { uid: 'u1' };
const mockOfferPush = jest.fn();
jest.mock('../../../lib/push/PushProvider', () => ({
  usePush: () => ({
    offerPush: mockOfferPush,
    permission: 'undetermined',
    refreshPermission: jest.fn(),
    requestPermission: jest.fn(),
  }),
}));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: null,
    profileChecked: true,
    refreshProfile: () => mockRefreshProfile(),
  }),
}));
const mockRequireAuth = jest.fn(() => false);
jest.mock('../../../lib/auth/RegisterGateContext', () => ({
  useRegisterGate: () => ({ requireAuth: mockRequireAuth, pendingIntent: null, clearPending: jest.fn() }),
}));
let mockIsAppAdmin = false;
jest.mock('../../../lib/auth/useIsAppAdmin', () => ({
  useIsAppAdmin: () => ({ isAppAdmin: mockIsAppAdmin }),
}));
jest.mock('../../../lib/deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('@cultuvilla/shared/services/mapsService', () => ({ staticMapUrl: jest.fn().mockReturnValue('https://maps.example.test/static') }));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({
  getVillageViewLink: jest.fn().mockReturnValue('https://example.test'),
}));
const mockJoinVillage = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  joinVillage: (...a: unknown[]) => mockJoinVillage(...a),
}));
// JoinVillageModal's barrio picker fetches approved barrios; none here, so the
// picker hides itself and the modal shows only escudo + name + confirm.
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getBarrios: jest.fn().mockResolvedValue([]),
  deletePlace: jest.fn(),
  deleteBarrio: jest.fn(),
}));
const mockGetPublicProfile = jest.fn();
jest.mock('@cultuvilla/shared/services/userService', () => ({
  getPublicProfile: (...a: unknown[]) => mockGetPublicProfile(...a),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: jest.fn().mockResolvedValue(null),
}));
let mockWelcomeSeen = true;
const mockMarkWelcomeSeen = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('../../../lib/village/ambassadorWelcome', () => ({
  hasSeenAmbassadorWelcome: async () => mockWelcomeSeen,
  markAmbassadorWelcomeSeen: (...a: unknown[]) => mockMarkWelcomeSeen(...a),
}));
// Real Spanish catalog so we can assert on the visible strings.
jest.mock('../../../lib/i18n', () => {
  const { getMessages } = jest.requireActual('@cultuvilla/i18n');
  const es = getMessages('es');
  const resolve = (k: string): unknown =>
    k.split('.').reduce<unknown>((o, seg) => (o == null ? undefined : (o as Record<string, unknown>)[seg]), es);
  return {
    useT: () => ({
      locale: 'es',
      t: (k: string, vars?: Record<string, string | number>) => {
        const tpl = resolve(k);
        if (typeof tpl !== 'string') return k;
        return vars ? tpl.replace(/\{(\w+)\}/g, (_: string, kk: string) => String(vars[kk] ?? `{${kk}}`)) : tpl;
      },
    }),
  };
});

const village = {
  id: 'm1',
  name: 'Anaya',
  slug: 'anaya',
  province: 'Segovia',
  communityActive: true,
  community: { organizerId: null, description: null },
} as unknown as VillageHomeState['village'];

const base: VillageHomeState = {
  coreLoading: false,
  coreError: null,
  village,
  villageAdmin: false,
  isMember: true,
  barrios: [],
  places: [],
  organizations: [],
  events: [],
  news: [],
  festivalPosters: [],
  history: [],
  wordOfTheDay: null,
  vocabularyCount: 0,
  peopleCount: 3,
  pendingOrganizerRequest: false,
  myCensoAnswers: {},
  sectionStatus: {
    events: 'ready',
    news: 'ready',
    festivalPosters: 'ready',
    barrios: 'ready',
    places: 'ready',
    organizations: 'ready',
    history: 'ready',
    vocabulary: 'ready',
  },
};

beforeEach(() => {
  mockJoinVillage.mockClear();
  mockRefreshProfile.mockClear();
  mockRequireAuth.mockClear();
  mockUser = { uid: 'u1' };
  mockIsAppAdmin = false;
  mockWelcomeSeen = true;
  mockMarkWelcomeSeen.mockClear();
  mockGetPublicProfile.mockReset();
  mockGetPublicProfile.mockResolvedValue({ id: 'amb', displayName: 'Ana Pérez' });
});

const withAmbassador = (sex: 'male' | 'female' | null): VillageHomeState => ({
  ...base,
  village: {
    ...village,
    community: { organizerId: 'amb', organizerSex: sex, description: null },
  } as unknown as VillageHomeState['village'],
});

describe('VillageHomeBody — Embajador', () => {
  it('invites a vecino to become Embajador when the pueblo has none', () => {
    const { getByText } = render(<VillageHomeBody data={base} reload={jest.fn()} />);
    expect(getByText('Quiero ser embajador')).toBeTruthy();
  });

  it('shows the Embajadora by name on the village home', async () => {
    const { findByText, getByText } = render(
      <VillageHomeBody data={withAmbassador('female')} reload={jest.fn()} />,
    );
    expect(await findByText('Ana Pérez')).toBeTruthy();
    expect(getByText('Embajadora del pueblo')).toBeTruthy();
    expect(getByText('Embajadora')).toBeTruthy();
    expect(mockGetPublicProfile).toHaveBeenCalledWith('amb');
  });

  it('welcomes a new Embajador once, then remembers it', async () => {
    mockUser = { uid: 'amb' };
    mockWelcomeSeen = false;
    const { findByTestId, getByTestId } = render(
      <VillageHomeBody data={withAmbassador('male')} reload={jest.fn()} />,
    );
    expect(await findByTestId('ambassador-welcome-sheet')).toBeTruthy();
    fireEvent.press(getByTestId('ambassador-welcome-dismiss'));
    expect(mockMarkWelcomeSeen).toHaveBeenCalledWith('m1', 'amb');
  });

  it('does not welcome anyone who is not the Embajador', async () => {
    mockWelcomeSeen = false;
    const { findByText, queryByTestId } = render(
      <VillageHomeBody data={withAmbassador('male')} reload={jest.fn()} />,
    );
    await findByText('Ana Pérez');
    expect(queryByTestId('ambassador-welcome-dismiss')).toBeNull();
  });
});

describe('VillageHomeBody', () => {
  it('hides the join CTA for a member', () => {
    const { queryByText } = render(<VillageHomeBody data={base} reload={jest.fn()} />);
    expect(queryByText('Unirme a este pueblo')).toBeNull();
  });

  it('shows the join CTA for a non-member and joins on confirm', async () => {
    const reload = jest.fn();
    const { getByText } = render(
      <VillageHomeBody data={{ ...base, isMember: false }} reload={reload} />,
    );
    // Press the CTA → the shared JoinVillageModal opens (escudo + name + confirm).
    fireEvent.press(getByText('Unirme a este pueblo'));
    // Confirm inside the modal → joins with the chosen barrio (null = whole village).
    fireEvent.press(await waitFor(() => getByText('Unirme')));
    // joinVillage both creates the membership and sets the active village so the
    // Pueblo tab surfaces it immediately (the bug this guards against).
    await waitFor(() =>
      expect(mockJoinVillage).toHaveBeenCalledWith('m1', 'u1', null),
    );
    expect(reload).toHaveBeenCalled();
    // Refresh the in-memory auth profile so the Pueblo tab picks up the new
    // activeMunicipalityId immediately, not only after an app restart.
    await waitFor(() => expect(mockRefreshProfile).toHaveBeenCalled());
    expect(mockOfferPush).toHaveBeenCalledWith('village_join', { villageName: expect.any(String) });
  });

  it('logged-out "sign in to join" carries the village across auth', () => {
    // A guest sees "Inicia sesión para unirte"; tapping it must hand the village
    // id to the auth gate so onboarding can pre-select and join it afterwards —
    // the fix for a picked village never landing in the profile.
    mockUser = null;
    const { getByText } = render(
      <VillageHomeBody data={{ ...base, isMember: false }} reload={jest.fn()} />,
    );
    fireEvent.press(getByText('Inicia sesión para unirte'));
    expect(mockRequireAuth).toHaveBeenCalledWith('/anaya', expect.any(String), 'm1');
  });

  it('renders the start-village notice when the community is dormant', () => {
    const dormant = {
      ...base,
      village: { ...village, communityActive: false } as VillageHomeState['village'],
    };
    const { getByText } = render(<VillageHomeBody data={dormant} reload={jest.fn()} />);
    expect(getByText('Iniciar este pueblo')).toBeTruthy();
  });

  it('non-admin member sees "Añadir contenido" + "Compartir pueblo" (no Editar)', () => {
    const { getByText, queryByText } = render(<VillageHomeBody data={base} reload={jest.fn()} />);
    expect(getByText('Añadir contenido')).toBeTruthy();
    expect(getByText('Compartir pueblo')).toBeTruthy();
    expect(queryByText('Editar pueblo')).toBeNull();
  });

  it('no longer offers a separate invite action to members', () => {
    const { queryByText } = render(<VillageHomeBody data={base} reload={jest.fn()} />);
    expect(queryByText('Invitar vecino')).toBeNull();
  });

  it('does not offer "Añadir contenido" to non-members (they see the join CTA)', () => {
    const { getByText, queryByText } = render(
      <VillageHomeBody data={{ ...base, isMember: false }} reload={jest.fn()} />,
    );
    expect(queryByText('Añadir contenido')).toBeNull();
    expect(getByText('Unirme a este pueblo')).toBeTruthy();
  });

  it('app admin who has not joined sees the join CTA, not "Añadir contenido"', () => {
    // Adding content requires membership; an app admin who is not yet a member
    // of this village must join first, so the two CTAs are mutually exclusive.
    mockIsAppAdmin = true;
    const { getByText, queryByText } = render(
      <VillageHomeBody data={{ ...base, isMember: false }} reload={jest.fn()} />,
    );
    expect(getByText('Unirme a este pueblo')).toBeTruthy();
    expect(queryByText('Añadir contenido')).toBeNull();
  });

  it('shows cemetery cards with a buried-person count badge instead of comments', () => {
    const cemetery = {
      ...buildPlaceData({ name: 'Cementerio', kind: 'cemetery', municipalityId: 'm1' }),
      id: 'cemetery-1',
      commentCount: 9,
      burialCount: 4,
    };
    const { getByTestId, getByText, queryByTestId } = render(
      <VillageHomeBody data={{ ...base, places: [cemetery] }} reload={jest.fn()} />,
    );

    expect(getByTestId('entity-card-burial-count')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    expect(queryByTestId('entity-card-comment-count')).toBeNull();
  });

  it('shows event cards with a confirmed-attendee count badge', () => {
    const event: VillageHomeState['events'][number] = {
      id: 'event-1',
      title: 'Fiesta del pueblo',
      description: '',
      startDate: new Date('2026-07-01T18:00:00Z'),
      endDate: null,
      location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'Plaza Mayor' },
      imageURL: null,
      maxAttendees: null,
      telephoneRequired: false,
      requiresPayment: false,
      signupFields: [],
    attendeesVisibility: 'members' as const,
    visibility: 'public' as const,
    visibilityOrgId: null,
    signupGroupSize: 1,
    minBirthYear: null,
    maxBirthYear: null,
    signupEnabled: true,
    signupInfo: null,
      status: 'published',
      organizerUserIds: ['u1'],
      organizerOrgIds: [],
      createdBy: 'u1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      municipalityId: 'm1',
      villageSlug: 'villa',
      villageName: 'Anaya',
      villageCoverImage: null,
      villageCoordinates: null,
      confirmedCount: 7,
      totalCount: 7,
      commentCount: 0,
      readCount: 0,
      endBoundary: new Date('2026-07-01T18:00:00Z'),
    };
    const { getByTestId, getByText } = render(
      <VillageHomeBody data={{ ...base, events: [event] }} reload={jest.fn()} />,
    );

    expect(getByTestId('entity-card-event-attendee-count')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
  });

  it('admin sees "Añadir contenido" + "Compartir pueblo" (no standalone Editar pill)', () => {
    const { getByText, queryByText } = render(
      <VillageHomeBody data={{ ...base, villageAdmin: true }} reload={jest.fn()} />,
    );
    expect(getByText('Añadir contenido')).toBeTruthy();
    expect(getByText('Compartir pueblo')).toBeTruthy();
    expect(queryByText('Editar pueblo')).toBeNull();
  });

  it('admin opens the sheet and "Detalles pueblo" routes to the community settings screen', () => {
    const { getByText } = render(
      <VillageHomeBody data={{ ...base, villageAdmin: true }} reload={jest.fn()} />,
    );
    fireEvent.press(getByText('Añadir contenido'));
    fireEvent.press(getByText('Detalles pueblo'));
    expect(router.push).toHaveBeenCalledWith('/anaya/comunidad');
  });

  it('shows the history and the word of the day — for non-members too, reading is open to everyone', () => {
    const history = [
      {
        id: 'h1',
        title: 'Llega la luz eléctrica',
        start: { year: 1956, month: null, day: null },
        end: null,
        approximate: false,
        body: { text: '', mentions: [], links: [], marks: [] },
        images: [],
      },
    ] as unknown as VillageHomeState['history'];
    const wordOfTheDay = {
      term: { id: 'm1__miaja', term: 'miaja', kind: 'palabra' },
      definition: null,
    } as unknown as VillageHomeState['wordOfTheDay'];
    const { getByText } = render(
      <VillageHomeBody
        data={{ ...base, isMember: false, history, wordOfTheDay, vocabularyCount: 12 }}
        reload={jest.fn()}
      />,
    );
    expect(getByText('Llega la luz eléctrica')).toBeTruthy();
    expect(getByText('Palabra del día')).toBeTruthy();
    fireEvent.press(getByText('Ver las 12'));
    expect(router.push).toHaveBeenCalledWith('/anaya/vocabulario');
  });

  it('non-admin members do not see the "Detalles pueblo" option in the sheet', () => {
    const { getByText, queryByText } = render(<VillageHomeBody data={base} reload={jest.fn()} />);
    fireEvent.press(getByText('Añadir contenido'));
    expect(queryByText('Detalles pueblo')).toBeNull();
  });

  it('opens the add-content sheet listing all seven entities and fans out on tap', () => {
    const { getByText, queryByText } = render(<VillageHomeBody data={base} reload={jest.fn()} />);
    expect(queryByText('¿Qué quieres añadir?')).toBeNull();
    fireEvent.press(getByText('Añadir contenido'));
    expect(getByText('¿Qué quieres añadir?')).toBeTruthy();
    ['Evento', 'Artículo', 'Grupo', 'Peña', 'Barrio', 'Lugar', 'Cartel de fiestas'].forEach(
      (label) => expect(getByText(label)).toBeTruthy(),
    );
    fireEvent.press(getByText('Evento'));
    expect(router.push).toHaveBeenCalledWith('/crear/evento?villageId=m1');
  });

  it('routes peña and agrupación to the org create screen with a preselected type', () => {
    const { getByText } = render(<VillageHomeBody data={base} reload={jest.fn()} />);
    fireEvent.press(getByText('Añadir contenido'));
    fireEvent.press(getByText('Peña'));
    expect(router.push).toHaveBeenCalledWith('/anaya/entidades?type=pena');
  });

  it('shows the censo fill CTA to a villager of a village with a configured censo', () => {
    const censoVillage = {
      ...village,
      community: {
        ...(village as unknown as { community: Record<string, unknown> }).community,
        profileForm: { fields: [{ key: 'age', label: 'Edad', type: 'number' }] },
      },
    } as unknown as VillageHomeState['village'];
    const { getByText } = render(
      <VillageHomeBody data={{ ...base, village: censoVillage }} reload={jest.fn()} />,
    );
    expect(getByText('Rellenar censo')).toBeTruthy();
  });

  it('hides the censo fill CTA when the village has no censo configured', () => {
    const { queryByText } = render(<VillageHomeBody data={base} reload={jest.fn()} />);
    expect(queryByText('Rellenar censo')).toBeNull();
  });

  it('hides the censo fill CTA from a non-member (registered but not a villager here)', () => {
    const { queryByText } = render(
      <VillageHomeBody data={{ ...base, isMember: false }} reload={jest.fn()} />,
    );
    expect(queryByText('Rellenar censo')).toBeNull();
    expect(queryByText('Editar censo')).toBeNull();
  });

  it('does not show the censo fill CTA to an admin who is not a member of this village', () => {
    const { queryByText } = render(
      <VillageHomeBody data={{ ...base, isMember: false, villageAdmin: true }} reload={jest.fn()} />,
    );
    // Admins still configure the censo, but filling requires being a villager.
    expect(queryByText('Rellenar censo')).toBeNull();
    expect(queryByText('Configurar censo')).toBeTruthy();
  });

  it('shows a skeleton row for a section whose fetch is still in flight', () => {
    const { getAllByTestId } = render(
      <VillageHomeBody
        data={{ ...base, sectionStatus: { ...base.sectionStatus, events: 'loading' } }}
        reload={jest.fn()}
      />,
    );
    expect(getAllByTestId('section-skeleton').length).toBeGreaterThan(0);
  });

  it('hides a failed section instead of blanking the whole tab', () => {
    const { queryByTestId, getByText } = render(
      <VillageHomeBody
        data={{ ...base, sectionStatus: { ...base.sectionStatus, events: 'error' } }}
        reload={jest.fn()}
      />,
    );
    // A section in error renders nothing (no skeleton), yet the tab chrome — the
    // village name — is still on screen: one failed fetch must not take it down.
    expect(queryByTestId('section-skeleton')).toBeNull();
    expect(getByText('Anaya')).toBeTruthy();
  });

  it('shows the article category instead of its publication date', () => {
    const publishedAt = new Date(2026, 5, 15);
    const post = {
      id: 'news-1',
      ...buildNewsPostData({
        municipalityId: 'm1',
        villageSlug: 'villa',
        createdBy: 'u1',
        organizerUserIds: ['u1'],
        title: 'Sabores de siempre',
        body: 'Recetas del pueblo',
        category: 'gastronomia',
        createdAt: publishedAt,
        publishedAt,
        updatedAt: publishedAt,
      }),
    };

    const { getByText, queryByText } = render(
      <VillageHomeBody data={{ ...base, news: [post] }} reload={jest.fn()} />,
    );

    expect(getByText('Gastronomía')).toBeTruthy();
    expect(queryByText('15/06/2026')).toBeNull();
  });
});

describe('subdivision sections', () => {
  const row = (id: string, name: string, kind: string) =>
    ({
      id,
      name,
      kind,
      source: 'osm',
      isSeat: false,
      images: [],
      residentCount: 0,
      commentCount: 0,
      municipalityId: 'v1',
      villageSlug: 'villa',
    }) as unknown as VillageHomeState['barrios'][number];

  it('renders one section per kind, titled with that region\'s word', () => {
    const { getByText } = render(
      <VillageHomeBody
        data={{
          ...base,
          barrios: [
            row('b1', 'El Arrabal', 'barrio'),
            row('p1', 'Villarino de Manzanas', 'pedania'),
          ],
        }}
        reload={jest.fn()}
      />,
    );
    expect(getByText('Barrios')).toBeTruthy();
    expect(getByText('Localidades')).toBeTruthy();
    expect(getByText('El Arrabal')).toBeTruthy();
    expect(getByText('Villarino de Manzanas')).toBeTruthy();
  });

  it('hides the sections a village has no rows for', () => {
    // Section returns null when empty, so a Castilian village with only
    // pedanías must not show an empty Parroquias or Aldeas header.
    const { queryByText } = render(
      <VillageHomeBody
        data={{ ...base, barrios: [row('p1', 'Matamala', 'pedania')] }}
        reload={jest.fn()}
      />,
    );
    expect(queryByText('Localidades')).toBeTruthy();
    expect(queryByText('Parroquias')).toBeNull();
    expect(queryByText('Aldeas')).toBeNull();
    expect(queryByText('Barrios')).toBeNull();
  });

  it('keeps Galician aldeas out of the Lugares section, which is places', () => {
    // "Lugares" is already the title of the places scroll (cementerios,
    // iglesias); Galician settlements are titled "Aldeas" so the two cannot
    // collide on the same screen.
    const { getByText, getAllByText } = render(
      <VillageHomeBody
        data={{
          ...base,
          barrios: [row('a1', 'Samarugo', 'parroquia'), row('a2', 'Ibarra', 'aldea')],
        }}
        reload={jest.fn()}
      />,
    );
    expect(getByText('Parroquias')).toBeTruthy();
    expect(getByText('Aldeas')).toBeTruthy();
    expect(getAllByText('Lugares').length).toBeLessThanOrEqual(1);
  });
});
