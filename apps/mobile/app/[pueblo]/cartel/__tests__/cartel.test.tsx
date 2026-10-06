import { render, waitFor } from '@testing-library/react-native';
import { emitWatched, resetWatchers, setWatched, watchersOf } from '../../../../test/watchers';
import FestivalPosterDetailScreen from '../[cartel]';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', cartel: 'fiestas-2026_p1' }),
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../../../../lib/navigation/VillageRouteGate');
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/festivalPosterService', () => ({
  watchFestivalPoster: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('poster'),
}));
jest.mock('@cultuvilla/shared/utils', () => ({
  ...jest.requireActual('@cultuvilla/shared/utils'),
  formatFestivalPosterDates: () => 'del 1 al 5',
}));
// NaturalImage reads Image.getSize (unmocked under jest-expo); the screen test
// only asserts the title, so stub it to a plain view.
jest.mock('../../../../components/primitives/NaturalImage', () => ({ NaturalImage: () => null }));
jest.mock('../../../../components/feature/EntityComments', () => ({ EntityComments: () => null }));
jest.mock('../../../../components/feature/EntityContributors', () => ({ EntityContributors: () => null }));
jest.mock('@cultuvilla/shared/services/commentsService', () => ({ recordEntityView: jest.fn().mockResolvedValue(undefined) }));

import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';

const POSTER = { id: 'p1', municipalityId: 'm1', villageSlug: 'villa', proposedBy: 'creator', title: 'Fiestas 2026', year: 2026, images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'], startsAt: null, endsAt: null, contributorUserIds: ['u1'], contributorOrgIds: ['o1'], status: 'active' };

function mockCaps(canEdit: boolean, uid: string | null) {
  (useEntityCapabilities as jest.Mock).mockReturnValue({
    canManage: false,
    canApprove: false,
    uid,
    loading: false,
    canEdit: jest.fn(() => canEdit),
    canDelete: jest.fn(() => canEdit),
  });
}

describe('FestivalPosterDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWatchers();
    setWatched('poster', POSTER);
  });

  it('renders the poster title once loaded', async () => {
    mockCaps(false, null);
    const { getByText } = render(<FestivalPosterDetailScreen />);
    await waitFor(() => getByText('Fiestas 2026'));
  });

  it('shows the edit action to the poster’s creator', async () => {
    mockCaps(true, 'creator');
    const { findByLabelText } = render(<FestivalPosterDetailScreen />);
    expect(await findByLabelText('common.edit')).toBeTruthy();
  });

  it('hides the edit action from an unrelated viewer', async () => {
    mockCaps(false, 'someone-else');
    const { getByText, queryByLabelText } = render(<FestivalPosterDetailScreen />);
    await waitFor(() => getByText('Fiestas 2026'));
    expect(queryByLabelText('common.edit')).toBeNull();
  });

  it('shows an update the moment the listener delivers it, with no reload', async () => {
    mockCaps(false, null);
    const { getByText, findByText } = render(<FestivalPosterDetailScreen />);
    await waitFor(() => getByText('Fiestas 2026'));
    emitWatched('poster', { ...POSTER, title: 'Fiestas de San Roque' });
    expect(await findByText('Fiestas de San Roque')).toBeTruthy();
    expect(watchersOf('poster')).toHaveLength(1);
    expect(watchersOf('poster')[0]?.args).toEqual(['p1']);
    expect(recordEntityView).toHaveBeenCalledTimes(1);
  });

  it('shows the not-found state once the poster is gone', async () => {
    mockCaps(false, null);
    const { getByText, findByText } = render(<FestivalPosterDetailScreen />);
    await waitFor(() => getByText('Fiestas 2026'));
    emitWatched('poster', null);
    expect(await findByText('common.notFound')).toBeTruthy();
  });
});
