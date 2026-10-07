import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import PlaceDetailScreen, { sortBuriedByDeathDate } from '../[lugar]';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { getPersonsByBurialPlace, updatePerson } from '@cultuvilla/shared/services/personService';
import { buildPlaceData } from '@cultuvilla/shared/models/municipality';
import { buildPersonData } from '@cultuvilla/shared/models/person';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', lugar: 'la-plaza_pl1' }),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../../../../lib/navigation/VillageRouteGate');
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => jest.fn() }));
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  watchPlace: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('place'),
}));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({
  getPlaceViewLink: () => ({
    url: 'https://x/villa/lugar/la-plaza_pl1',
    path: '/villa/lugar/la-plaza_pl1',
    kind: 'content',
    resource: 'place',
  }),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonsByBurialPlace: jest.fn().mockResolvedValue([]),
  updatePerson: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../components/feature/EntityComments', () => ({ EntityComments: () => null }));
jest.mock('../../../../components/feature/EntityContributors', () => ({ EntityContributors: () => null }));
jest.mock('../../../../components/feature/BuryFab', () => ({ BuryFab: () => null }));
jest.mock('@cultuvilla/shared/services/commentsService', () => ({ recordEntityView: jest.fn().mockResolvedValue(undefined) }));
// staticMapUrl reads the initialized Firebase app for its project id.
jest.mock('@cultuvilla/shared/services/mapsService', () => ({
  staticMapUrl: (lat: number, lng: number) => `https://maps.test/${lat},${lng}`,
  MAP_ZOOM_DEFAULT: 13,
}));

import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';

function mockCaps(opts: { canEdit?: boolean; uid?: string | null } = {}) {
  (useEntityCapabilities as jest.Mock).mockReturnValue({
    canManage: false,
    canApprove: false,
    uid: opts.uid ?? 'u1',
    loading: false,
    canEdit: jest.fn(() => opts.canEdit ?? false),
    canDelete: jest.fn(() => opts.canEdit ?? false),
  });
}

describe('PlaceDetailScreen', () => {
  beforeEach(() => {
    mockCaps();
    resetWatchers();
    jest.mocked(getPersonsByBurialPlace).mockReset();
    jest.mocked(updatePerson).mockClear();
    setWatched('place', {
      ...buildPlaceData({
        name: 'La Plaza',
        kind: 'plaza',
        municipalityId: 'm1',
        description: 'desc',
      }),
      id: 'pl1',
    });
    jest.mocked(getPersonsByBurialPlace).mockResolvedValue([]);
  });

  it('renders the place name and a share action', async () => {
    const { getByText, getByLabelText } = render(<PlaceDetailScreen />);
    await waitFor(() => getByText('La Plaza'));
    getByLabelText('deeplink.shareViewLabel');
  });

  it('shows the edit action to the place’s creator, not to an unrelated viewer', async () => {
    const { getByText, queryByLabelText } = render(<PlaceDetailScreen />);
    await waitFor(() => getByText('La Plaza'));
    expect(queryByLabelText('common.edit')).toBeNull();

    mockCaps({ canEdit: true, uid: 'creator' });
    const creatorView = render(<PlaceDetailScreen />);
    expect(await creatorView.findByLabelText('common.edit')).toBeTruthy();
  });

  it('sorts buried people by death date, most recent first and unknown last', () => {
    const people = [
      { ...buildPersonData({ givenName: 'Unknown', createdBy: 'u1' }), id: 'unknown' },
      {
        ...buildPersonData({
          givenName: 'Old',
          createdBy: 'u1',
          deathDate: { year: 1990, month: null, day: null },
        }),
        id: 'old',
      },
      {
        ...buildPersonData({
          givenName: 'Recent',
          createdBy: 'u1',
          deathDate: { year: 2020, month: 5, day: 3 },
        }),
        id: 'recent',
      },
    ];

    expect(sortBuriedByDeathDate(people).map((p) => p.id)).toEqual(['recent', 'old', 'unknown']);
  });

  it('renders cemetery difuntos as a date-sorted list and opens the burial editor instead of routing', async () => {
    setWatched('place', {
      ...buildPlaceData({
        name: 'Cementerio',
        kind: 'cemetery',
        municipalityId: 'm1',
      }),
      id: 'pl1',
    });
    jest.mocked(getPersonsByBurialPlace).mockResolvedValueOnce([
      {
        ...buildPersonData({
          givenName: 'Antigua',
          firstSurname: 'Sin Fecha',
          createdBy: 'u1',
          burialPlace: { municipalityId: 'm1', placeId: 'pl1' },
        }),
        id: 'p-old',
      },
      {
        ...buildPersonData({
          givenName: 'Reciente',
          firstSurname: 'Con Fecha',
          createdBy: 'u1',
          deathDate: { year: 2020, month: 5, day: 3 },
          burialPlace: { municipalityId: 'm1', placeId: 'pl1' },
        }),
        id: 'p-recent',
      },
    ]);

    const { getByTestId, queryByText } = render(<PlaceDetailScreen />);

    await waitFor(() => getByTestId('buried-person-row-p-recent'));
    expect(getByTestId('buried-person-date-p-recent')).toHaveTextContent('03/05/2020');
    expect(getByTestId('buried-person-date-p-old')).toHaveTextContent('village.placeDetail.deathDateUnknown');

    fireEvent.press(getByTestId('buried-person-row-p-old'));

    expect(getByTestId('buried-edit-person-name')).toHaveTextContent('Antigua Sin Fecha');
    expect(queryByText('village.placeDetail.deathDateUnknown')).toBeNull();
    expect(queryByText('village.placeDetail.editBurialTitle')).toBeNull();
    expect(router.push).not.toHaveBeenCalledWith('/persona/p-old');
  });

  it('asks for the viewer\'s own burials and marks a private one with a lock', async () => {
    setWatched('place', {
      ...buildPlaceData({ name: 'Cementerio', kind: 'cemetery', municipalityId: 'm1' }),
      id: 'pl1',
    });
    jest.mocked(getPersonsByBurialPlace).mockResolvedValueOnce([
      {
        ...buildPersonData({
          givenName: 'Publica',
          createdBy: 'u1',
          burialPlace: { municipalityId: 'm1', placeId: 'pl1' },
        }),
        id: 'p-public',
      },
      {
        ...buildPersonData({
          givenName: 'Privada',
          createdBy: 'u1',
          isPublic: false,
          burialPlace: { municipalityId: 'm1', placeId: 'pl1' },
        }),
        id: 'p-private',
      },
    ]);

    const { getByTestId, queryByTestId } = render(<PlaceDetailScreen />);

    await waitFor(() => getByTestId('buried-person-row-p-private'));
    // Without the uid the query can only return public burials, so the viewer's
    // own private relative would be missing from their cemetery.
    expect(getPersonsByBurialPlace).toHaveBeenCalledWith('pl1', 'u1');
    expect(getByTestId('buried-person-private-p-private')).toBeTruthy();
    expect(queryByTestId('buried-person-private-p-public')).toBeNull();
  });

  it('updates or removes the selected cemetery burial from the editor modal', async () => {
    setWatched('place', {
      ...buildPlaceData({
        name: 'Cementerio',
        kind: 'cemetery',
        municipalityId: 'm1',
      }),
      id: 'pl1',
    });
    jest.mocked(getPersonsByBurialPlace).mockResolvedValue([
      {
        ...buildPersonData({
          givenName: 'Ada',
          firstSurname: 'Lovelace',
          createdBy: 'u1',
          deathDate: { year: 2020, month: null, day: null },
          burialPlace: { municipalityId: 'm1', placeId: 'pl1' },
        }),
        id: 'p1',
      },
    ]);

    const { getByTestId } = render(<PlaceDetailScreen />);

    fireEvent.press(await waitFor(() => getByTestId('buried-person-row-p1')));
    fireEvent.press(getByTestId('buried-save-date'));

    await waitFor(() =>
      expect(updatePerson).toHaveBeenCalledWith('p1', { deathDate: { year: 2020, month: null, day: null } }),
    );

    fireEvent.press(getByTestId('buried-person-row-p1'));
    fireEvent.press(getByTestId('buried-remove'));

    await waitFor(() => expect(updatePerson).toHaveBeenCalledWith('p1', { burialPlace: null }));
  });
});

// The pin is optional, so the detail screen must read fine without one and
// grow a tappable map when a place has been located.
describe('PlaceDetailScreen location', () => {
  beforeEach(() => {
    mockCaps();
    jest.mocked(getPersonsByBurialPlace).mockResolvedValue([]);
  });

  it('renders no map for a place nobody has pinned', async () => {
    setWatched('place', {
      ...buildPlaceData({ name: 'La Plaza', kind: 'plaza', municipalityId: 'm1' }),
      id: 'pl1',
    });
    const { getByText, queryByTestId } = render(<PlaceDetailScreen />);
    await waitFor(() => getByText('La Plaza'));
    expect(queryByTestId('place-location-map')).toBeNull();
  });

  it('renders the map and the saved location name once the place is pinned', async () => {
    setWatched('place', {
      ...buildPlaceData({
        name: 'La Plaza',
        kind: 'plaza',
        municipalityId: 'm1',
        coordinates: { lat: 40.03, lng: -3.6 },
        locationLabel: 'Plaza Mayor, Abadía',
      }),
      id: 'pl1',
    });
    const { getByText, findByTestId } = render(<PlaceDetailScreen />);
    await findByTestId('place-location-map');
    getByText('Plaza Mayor, Abadía');
  });
});
