import { fireEvent, render, waitFor } from '@testing-library/react-native';
import EventDetailScreen from '../[evento]';
import { emitWatched, resetWatchers, setWatched, watchersOf } from '../../../../test/watchers';

const mockPush = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', evento: 'verbena_e1' }),
  router: {
    back: jest.fn(),
    push: (...args: unknown[]) => mockPush(...args),
    canGoBack: () => true,
    replace: jest.fn(),
  },
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../../../lib/auth/RegisterGateContext', () => ({ useRegisterGate: () => ({ requireAuth: jest.fn() }) }));
jest.mock('../../../../lib/deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => jest.fn() }));
jest.mock('../../../../components/feature/LiveOwnerChip', () => ({ LiveOwnerChip: () => null }));
jest.mock('../../../../components/feature/RegisterFab', () => ({ RegisterFab: () => null }));
jest.mock('../../../../components/feature/EntityComments', () => ({ EntityComments: () => null }));
jest.mock('@cultuvilla/shared/services/commentsService', () => ({ recordEntityView: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: () => ({
    canManage: false,
    canApprove: false,
    uid: null,
    loading: false,
    canEdit: () => false,
    canDelete: () => false,
  }),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  watchEvent: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('event'),
}));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({
  getEventLink: () => ({
    url: 'https://x/villa/evento/verbena_e1',
    path: '/villa/evento/verbena_e1',
    kind: 'content',
    resource: 'event',
  }),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({ getPersonByUserId: jest.fn().mockResolvedValue(null) }));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  watchMunicipality: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('village'),
}));
jest.mock('@cultuvilla/shared/models/person/PersonDataModel', () => ({ buildNameWithNickname: () => 'N' }));
jest.mock('@cultuvilla/shared/utils', () => ({
  ...jest.requireActual('@cultuvilla/shared/utils'),
  formatDate: () => '12 jul',
  buildGoogleCalendarUrl: () => 'https://cal',
}));

const EVENT = {
  id: 'e1', title: 'Verbena', startDate: new Date('2026-07-12T20:00:00Z'), endDate: null,
  description: 'baile', imageURL: null, villageCoverImage: null, location: null,
  organizerUserIds: [], organizerOrgIds: [], telephoneRequired: false,
  municipalityId: 'm1',
  villageSlug: 'villa', villageName: 'Villapueblo',
};

describe('EventDetailScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    resetWatchers();
    setWatched('event', EVENT);
    setWatched('village', {
      id: 'm1', name: 'Villapueblo', escudoUrl: null, escudoThumbUrl: null, escudoManualUrl: null,
    });
  });

  it('renders the event title and the guest CTA', async () => {
    const { getByText } = render(<EventDetailScreen />);
    await waitFor(() => getByText('Verbena'));
    getByText('guest.eventCta');
  });

  it('renders the Pueblo section and navigates to the village on press', async () => {
    const { getByLabelText, getByText } = render(<EventDetailScreen />);
    await waitFor(() => getByText('event.villageLabel'));
    getByText('Villapueblo');

    fireEvent.press(getByLabelText('Villapueblo'));
    expect(mockPush).toHaveBeenCalledWith('/villa');
  });

  it('shows an edit to the event as soon as the listener delivers it', async () => {
    const { getByText, findByText } = render(<EventDetailScreen />);
    await waitFor(() => getByText('Verbena'));
    emitWatched('event', { ...EVENT, title: 'Verbena de San Juan' });
    expect(await findByText('Verbena de San Juan')).toBeTruthy();
    expect(watchersOf('event')).toHaveLength(1);
    expect(watchersOf('village')[0]?.args).toEqual(['m1']);
  });

  it('shows the not-found state for an event that does not exist', async () => {
    setWatched('event', null);
    const { findByText } = render(<EventDetailScreen />);
    expect(await findByText('common.notFound')).toBeTruthy();
    expect(watchersOf('village')).toHaveLength(0);
  });
});
