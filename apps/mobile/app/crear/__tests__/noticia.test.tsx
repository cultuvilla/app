import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NewNewsScreen from '../noticia';
import { pickImageWithSize } from '../../../lib/images';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1', email: 'a@b.test' }, profile: { activeMunicipalityId: 'm-1' } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
}));
// Create mode never consults it, but the hook is mounted either way — stub it
// so the suite doesn't reach the village-member service.
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: () => ({
    canManage: false,
    canApprove: false,
    uid: 'uid-1',
    loading: false,
    can: () => true,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@cultuvilla/shared/services/newsService', () => ({
  createNewsPost: jest.fn(),
  updateNewsPost: jest.fn(),
  getNewsPost: jest.fn(),
}));
// Create mode resolves the target pueblo's slug to build the article's URL.
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getVillageSlug: jest.fn().mockResolvedValue('villa'),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadNewsImage: jest.fn(),
  newsImageDownloadURL: jest.fn(),
}));
// The block editor / cover pick images through this helper (which internally
// reads via lib/images.uriToBlob — covered by lib/__tests__/images.test.ts).
jest.mock('../../../lib/images', () => ({
  pickImageWithSize: jest.fn().mockResolvedValue({
    blob: { type: 'image/jpeg' },
    previewUri: 'file:///tmp/pic.jpg',
    contentType: 'image/jpeg',
    width: 100,
    height: 80,
  }),
}));
// Avoid live Firestore reads for the @-mention directory.
jest.mock('../../../lib/useMentionSources', () => ({
  useMentionSources: () => ({ candidates: [], loading: false }),
}));
jest.mock('../../../components/feature/OrganizerPicker', () => ({
  OrganizerPicker: ({ municipalityId, lockedUserId }: { municipalityId: string; lockedUserId?: string }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <Text testID="organizer-picker">{`OrganizerPicker:${municipalityId}:${lockedUserId ?? ''}`}</Text>
    );
  },
}));

describe('NewNewsScreen', () => {
  it('picks the cover image via pickImageWithSize on the first step', async () => {
    const { getByLabelText } = render(<NewNewsScreen />);
    fireEvent.press(getByLabelText('news.compose.addCover'));
    await waitFor(() => expect(pickImageWithSize).toHaveBeenCalled());
  });

  it('reaches the attribution step and wires OrganizerPicker with the locked creator', async () => {
    const { getByLabelText, getByText, getByPlaceholderText, queryByTestId } = render(<NewNewsScreen />);

    // Step 1 (basics): title + category satisfy the step's validation. The
    // category dropdown must be opened before its options are pressable.
    fireEvent.changeText(getByLabelText('news.compose.titleLabel'), 'Fiestas 2026');
    fireEvent.press(getByLabelText('news.compose.categoryLabel'));
    fireEvent.press(getByText('news.compose.category.fiesta'));
    expect(queryByTestId('organizer-picker')).toBeNull(); // not on step 1
    fireEvent.press(getByText('common.stepper.next'));

    // Step 2 (content): a non-empty text block satisfies validation.
    fireEvent.changeText(
      getByPlaceholderText('news.compose.block.textPlaceholder'),
      'El programa de fiestas ya está aquí.',
    );
    fireEvent.press(getByText('common.stepper.next'));

    // Step 3 (attribution): the OrganizerPicker renders with the right props.
    const picker = getByText('OrganizerPicker:m-1:uid-1');
    expect(picker).toBeTruthy();
  });
});
