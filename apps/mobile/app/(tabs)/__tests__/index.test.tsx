import { fireEvent, render } from '@testing-library/react-native';
import FeedScreen from '../index';
import {
  getPrivateUpcomingFeed,
  getUpcomingFeed,
} from '@cultuvilla/shared/services/feedService';
import { getAllVillagesFeed } from '@cultuvilla/shared/services/newsService';
import { buildEventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { buildNewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';

jest.mock('@cultuvilla/shared', () => ({
  observability: { track: jest.fn() },
  OBSERVABILITY_EVENTS: {},
}));
/**
 * The screen watches the feeds; each `watch*` mock answers once with what its
 * `get*` twin resolves, so a test sets data on the familiar `get*` mock.
 */
function mockWatchFrom(get: (...args: unknown[]) => unknown, pick = (v: unknown) => v) {
  return (...args: unknown[]) => {
    const onError = args.pop() as (e: unknown) => void;
    const onNext = args.pop() as (v: unknown) => void;
    Promise.resolve(get(...args)).then((v) => onNext(pick(v)), onError);
    return () => undefined;
  };
}
jest.mock('@cultuvilla/shared/services/feedService', () => {
  const getUpcomingFeed = jest.fn().mockResolvedValue({ events: [] });
  const getPrivateUpcomingFeed = jest.fn().mockResolvedValue([]);
  return {
    getUpcomingFeed,
    getPrivateUpcomingFeed,
    watchUpcomingFeed: mockWatchFrom(getUpcomingFeed, (page) => (page as { events: unknown[] }).events),
    watchPrivateUpcomingFeed: mockWatchFrom(getPrivateUpcomingFeed),
    haversineKm: jest.fn().mockReturnValue(0),
  };
});
jest.mock('@cultuvilla/shared/services/newsService', () => {
  const getAllVillagesFeed = jest.fn().mockResolvedValue([]);
  return { getAllVillagesFeed, watchAllVillagesFeed: mockWatchFrom(getAllVillagesFeed) };
});
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getActiveCommunities: jest.fn().mockResolvedValue([]),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  // The real hook runs its callback on focus; running it in an effect (rather
  // than during render, which would loop on the setState inside) is close
  // enough for a mounted screen.
  const react = jest.requireActual('react');
  return {
    router: { push: jest.fn() },
    useFocusEffect: (cb: () => void) => react.useEffect(cb, []),
  };
});
const mockRibbonFor = jest.fn((_eventId: string) => null as unknown);
jest.mock('../../../lib/registrations/MyRegistrationsContext', () => ({
  useMyRegistrations: () => ({ ribbonFor: (id: string) => mockRibbonFor(id), refresh: jest.fn() }),
}));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-1' },
    profile: { activeMunicipalityId: 'mun1' },
    profileChecked: true,
  }),
}));
jest.mock('../../../lib/auth/RegisterGateContext', () => ({
  useRegisterGate: () => ({ requireAuth: jest.fn(() => true), pendingIntent: null, clearPending: jest.fn() }),
}));
jest.mock('../../../lib/firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, fn: () => unknown) => fn(),
  reportFirestoreError: jest.fn(),
}));
jest.mock('../../../components/layout/AppHeader', () => ({
  AppHeader: () => null,
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (key: string) => {
      const map: Record<string, string> = {
        'feed.tab.events': 'Eventos',
        'feed.tab.news': 'Artículos',
        'event.ribbon.confirmed': 'Apuntado',
      };
      return map[key] ?? key;
    },
  }),
}));

const event = {
  ...buildEventData({
    title: 'Verbena',
    description: 'x',
    startDate: new Date('2099-06-15T18:00:00Z'),
    location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'Plaza Mayor' },
    organizerUserIds: ['uid-1'],
    organizerOrgIds: [],
    createdBy: 'uid-1',
    municipalityId: 'mun1',
    villageSlug: 'villa',
    villageName: 'Sotos de Mayorga',
    villageCoordinates: { lat: 40.4, lng: -3.7 },
  }),
  id: 'event1',
};
const post = {
  ...buildNewsPostData({
    municipalityId: 'mun1',
    villageSlug: 'villa',
    createdBy: 'uid-1',
    organizerUserIds: ['uid-1'],
    title: 'Corte de agua',
    body: 'x',
    category: 'fiesta',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }),
  id: 'news1',
};

// The feed's tab order is driven by the module-level TABS array; the toggle
// labels, the pager pages and the default tab all derive from it. These tests
// pin the observable consequences so the three can't silently drift apart.
describe('FeedScreen tab order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRibbonFor.mockReturnValue(null);
    (getUpcomingFeed as jest.Mock).mockResolvedValue({ events: [event] });
    (getAllVillagesFeed as jest.Mock).mockResolvedValue([post]);
  });

  it('shows Artículos before Eventos in the toggle', async () => {
    const { findAllByText } = render(<FeedScreen />);
    const labels = (await findAllByText(/^(Artículos|Eventos)$/)).map((n) => n.props.children);
    expect(labels).toEqual(['Artículos', 'Eventos']);
  });

  it('opens on the Artículos feed', async () => {
    const { findByText } = render(<FeedScreen />);
    // The news feed only loads when its tab is the active one, so its content
    // appearing without any interaction proves Artículos is the landing tab.
    expect(await findByText('Corte de agua', undefined, { timeout: 5000 })).toBeTruthy();
  });
});

// Artículos is the landing tab, so suites about event cards switch to Eventos first.
async function renderOnEventsTab() {
  const utils = render(<FeedScreen />);
  fireEvent.press(await utils.findByText('Eventos'));
  return utils;
}

// The ribbon's own states are covered by EventCard.test.tsx; what this pins is
// the wiring — the feed asks the registrations context about each event it
// renders, and hands the answer to the card.
describe('FeedScreen sign-up ribbon', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRibbonFor.mockReturnValue(null);
    (getUpcomingFeed as jest.Mock).mockResolvedValue({ events: [event] });
    (getAllVillagesFeed as jest.Mock).mockResolvedValue([]);
  });

  it('marks an event the viewer is signed up for', async () => {
    mockRibbonFor.mockReturnValue({ kind: 'confirmed', count: 1 });
    const { findByText } = await renderOnEventsTab();
    expect(await findByText('Apuntado', undefined, { timeout: 5000 })).toBeTruthy();
    expect(mockRibbonFor).toHaveBeenCalledWith('event1');
  });

  it('leaves an event the viewer has no registrations on unmarked', async () => {
    const { findByText, queryByText } = await renderOnEventsTab();
    await findByText('Verbena', undefined, { timeout: 5000 });
    expect(queryByText('Apuntado')).toBeNull();
  });
});

// The private half of the feed is a separate query per org, so the screen is
// what stitches the two lists into one chronological feed — and what has to
// survive the private half failing.
describe('FeedScreen private events', () => {
  const privateEvent = {
    ...event,
    id: 'ev-priv',
    title: 'Cena de la peña',
    visibility: 'organization' as const,
    visibilityOrgId: 'org-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRibbonFor.mockReturnValue(null);
    (getAllVillagesFeed as jest.Mock).mockResolvedValue([]);
  });

  it('shows the viewer’s private events alongside the public ones', async () => {
    (getUpcomingFeed as jest.Mock).mockResolvedValue({ events: [event] });
    (getPrivateUpcomingFeed as jest.Mock).mockResolvedValue([privateEvent]);

    const { findByText } = await renderOnEventsTab();
    expect(await findByText('Verbena', undefined, { timeout: 5000 })).toBeTruthy();
    expect(await findByText('Cena de la peña', undefined, { timeout: 5000 })).toBeTruthy();
  });

  it('still renders the public feed when the private half fails', async () => {
    (getUpcomingFeed as jest.Mock).mockResolvedValue({ events: [event] });
    (getPrivateUpcomingFeed as jest.Mock).mockRejectedValue(new Error('permission-denied'));

    const { findByText } = await renderOnEventsTab();
    expect(await findByText('Verbena', undefined, { timeout: 5000 })).toBeTruthy();
  });
});
