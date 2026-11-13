// The news edit route had no authority guard at all: anyone who deep-linked to
// /crear/noticia?newsId=… got the compose form (their save then bounced off the
// Firestore rules). It now redirects like every other entity's edit screen.
import { render, waitFor } from '@testing-library/react-native';
import NewNewsScreen from '../noticia';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'intruder' }, profile: { activeMunicipalityId: 'm-1' } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ newsId: 'n1' }),
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/newsService', () => ({
  createNewsPost: jest.fn(),
  updateNewsPost: jest.fn(),
  deleteNewsPost: jest.fn(),
  getNewsPost: jest.fn().mockResolvedValue({
    id: 'n1',
    title: 'Gran noticia',
    category: 'general',
    municipalityId: 'm-1',
    villageSlug: 'villa',
    images: [],
    coverImage: null,
    content: [],
    body: 'Cuerpo',
    organizerUserIds: ['author'],
    organizerOrgIds: [],
    createdBy: 'author',
    publishedAt: null,
    createdAt: null,
    status: 'active',
  }),
}));
// Edit mode takes the pueblo slug off the loaded post; it never looks it up.
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({ getVillageSlug: jest.fn() }));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadNewsImage: jest.fn(),
  newsImageDownloadURL: jest.fn(),
}));
jest.mock('../../../lib/images', () => ({ pickImageWithSize: jest.fn() }));
jest.mock('../../../lib/useMentionSources', () => ({
  useMentionSources: () => ({ candidates: [], loading: false }),
}));
jest.mock('../../../components/feature/OrganizerPicker', () => ({ OrganizerPicker: () => null }));

import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';

function mockCaps(canEdit: boolean, canDelete: boolean = canEdit) {
  const spy = jest.fn(() => canEdit);
  (useEntityCapabilities as jest.Mock).mockReturnValue({
    canManage: false,
    canApprove: false,
    uid: 'intruder',
    loading: false,
    canEdit: spy,
    canDelete: jest.fn(() => canDelete),
  });
  return spy;
}

beforeEach(() => jest.clearAllMocks());

describe('NewNewsScreen edit guard', () => {
  it('redirects to the article when the viewer may not edit it', async () => {
    const canEdit = mockCaps(false);
    render(<NewNewsScreen />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith({ href: '/villa/noticia/gran-noticia_n1' }));
    expect(canEdit).toHaveBeenCalledWith('author', ['author']);
  });

  it('lets an authorized editor through', async () => {
    const canEdit = mockCaps(true);
    render(<NewNewsScreen />);
    // Asserting on the hook call rather than a field: the compose form is a
    // Stepper, so which inputs are mounted depends on the current step.
    await waitFor(() => expect(canEdit).toHaveBeenCalledWith('author', ['author']));
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

// The delete button called deleteNewsPost, which only the author or an admin
// may use, while any co-writer could reach the screen — so a co-writer's
// delete failed silently and the article stayed up (E2E flow 80).
describe('NewNewsScreen delete button', () => {
  it('is hidden from a co-writer who may edit but not delete', async () => {
    const canEdit = mockCaps(true, false);
    const screen = render(<NewNewsScreen />);
    await waitFor(() => expect(canEdit).toHaveBeenCalled());
    expect(screen.queryByTestId('news-delete')).toBeNull();
  });

  it('is shown to whoever may delete it', async () => {
    mockCaps(true, true);
    const screen = render(<NewNewsScreen />);
    await waitFor(() => expect(screen.getByTestId('news-delete')).toBeTruthy());
  });
});
