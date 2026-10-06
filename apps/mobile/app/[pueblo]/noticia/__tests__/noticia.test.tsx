import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import NewsDetailScreen from '../[noticia]';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', noticia: 'gran-noticia_n1' }),
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => jest.fn() }));
jest.mock('../../../../components/feature/NewsContentRenderer', () => ({ NewsContentRenderer: () => null }));
jest.mock('../../../../components/feature/LiveOwnerChip', () => ({
  LiveOwnerChip: ({
    ownerId,
    ownerType,
    onPress,
  }: {
    ownerId: string;
    ownerType: string;
    onPress?: () => void;
  }) => {
    const { Text } = require('react-native');
    return (
      <Text testID={`chip:${ownerType}:${ownerId}`} onPress={onPress}>
        {ownerId}
      </Text>
    );
  },
}));
jest.mock('../../../../components/feature/EntityComments', () => ({ EntityComments: () => null }));
jest.mock('@cultuvilla/shared/services/commentsService', () => ({ recordEntityView: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({
  getNewsLink: () => ({
    url: 'https://x/villa/noticia/gran-noticia_n1',
    path: '/villa/noticia/gran-noticia_n1',
    kind: 'content',
    resource: 'news',
  }),
}));
// An organization chip resolves the org to learn its pueblo and name slug.
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  getOrganization: jest.fn().mockResolvedValue({ id: 'o1', name: 'Peña El Roble', villageSlug: 'villa' }),
}));
jest.mock('@cultuvilla/shared/services/newsService', () => ({
  watchNewsPost: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('post'),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({ newsImageDownloadURL: jest.fn() }));
jest.mock('@cultuvilla/shared/utils', () => ({
  ...jest.requireActual('@cultuvilla/shared/utils'),
  formatDate: () => '',
}));

import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';

function mockCaps(canEdit: boolean) {
  const spy = jest.fn(() => canEdit);
  (useEntityCapabilities as jest.Mock).mockReturnValue({
    canManage: false,
    canApprove: false,
    uid: canEdit ? 'u1' : null,
    loading: false,
    canEdit: spy,
    canDelete: jest.fn(() => canEdit),
  });
  return spy;
}

const POST = {
  id: 'n1', title: 'Gran noticia', category: 'general', municipalityId: 'm1', villageSlug: 'villa',
  images: [], coverImage: null, content: null, body: '',
  organizerOrgIds: ['o1'], organizerUserIds: ['u1'],
  createdBy: 'u9', publishedAt: null, createdAt: null, status: 'active',
};

beforeEach(() => {
  jest.clearAllMocks();
  resetWatchers();
  setWatched('post', POST);
  mockCaps(false);
});

describe('NewsDetailScreen', () => {
  it('renders the post title once loaded', async () => {
    const { getByText } = render(<NewsDetailScreen />);
    await waitFor(() => getByText('Gran noticia'));
  });

  // The screen no longer decides authority itself — it asks the shared hook,
  // passing the post's author AND its organizer set.
  it('asks the capability hook about the author and the organizer set', async () => {
    const canEdit = mockCaps(true);
    const { findByLabelText } = render(<NewsDetailScreen />);
    expect(await findByLabelText('news.compose.editTitle')).toBeTruthy();
    expect(canEdit).toHaveBeenCalledWith('u9', ['u1']);
  });

  it('hides the edit action when the hook says no', async () => {
    const { getByText, queryByLabelText } = render(<NewsDetailScreen />);
    await waitFor(() => getByText('Gran noticia'));
    expect(queryByLabelText('news.compose.editTitle')).toBeNull();
  });

  it('opens the byline author and organization from their chips', async () => {
    const { router } = jest.requireMock('expo-router');
    const { getByTestId, findByTestId } = render(<NewsDetailScreen />);

    fireEvent.press(await findByTestId('chip:user:u1'));
    expect(router.push).toHaveBeenCalledWith('/usuario/u1');

    router.push.mockClear();
    fireEvent.press(getByTestId('chip:organization:o1'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/villa/entidad/pena-el-roble_o1'));
  });
});
