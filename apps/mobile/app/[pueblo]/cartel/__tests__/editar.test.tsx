import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', cartel: 'fiestas_fp1' }),
  router: { replace: jest.fn(), back: jest.fn() },
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock('../../../../lib/navigation/VillageRouteGate');
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/festivalPosterService', () => ({
  getFestivalPoster: jest.fn(),
  updateFestivalPoster: jest.fn(),
  deleteFestivalPoster: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/moderationService', () => ({
  hideContent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadFestivalPosterImage: jest.fn(),
}));
jest.mock('../../../../components/feature/OrganizerPicker', () => ({ OrganizerPicker: () => null }));

import PosterEditScreen from '../[cartel]/editar';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { getFestivalPoster } from '@cultuvilla/shared/services/festivalPosterService';
import { uploadFestivalPosterImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';

function mockCaps(opts: { canManage: boolean; uid: string | null; canEdit: boolean }) {
  const caps = {
    canManage: opts.canManage,
    canApprove: opts.canManage,
    uid: opts.uid,
    loading: false,
    canEdit: jest.fn(() => opts.canEdit),
    canDelete: jest.fn(() => opts.canEdit),
  };
  (useEntityCapabilities as jest.Mock).mockReturnValue(caps);
  return caps;
}

beforeEach(() => {
  jest.clearAllMocks();
  (getFestivalPoster as jest.Mock).mockResolvedValue({
    id: 'fp1',
    municipalityId: 'm1',
    villageSlug: 'villa',
    year: 2025,
    title: 'Fiestas',
    images: [],
    datePrecision: 'year',
    startsAt: null,
    endsAt: null,
    proposedBy: 'creator',
    contributorUserIds: [],
    contributorOrgIds: [],
    status: 'active',
  });
});

it('renders the poster edit form with a delete action for an admin', async () => {
  mockCaps({ canManage: true, uid: 'boss', canEdit: true });
  const { getByLabelText, getByDisplayValue } = render(<PosterEditScreen />);
  await waitFor(() => getByDisplayValue('2025'));
  // useT is mocked to identity, so the delete affordance's label is the key.
  expect(getByLabelText('common.delete')).toBeTruthy();
});

it('redirects when the viewer can neither manage nor edit', async () => {
  mockCaps({ canManage: false, uid: 'u1', canEdit: false });
  render(<PosterEditScreen />);
  await waitFor(() =>
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/villa/cartel/fiestas_fp1' }),
  );
});

it('lets the creator edit their own poster without being a village admin', async () => {
  const caps = mockCaps({ canManage: false, uid: 'creator', canEdit: true });
  const { findByDisplayValue } = render(<PosterEditScreen />);
  await findByDisplayValue('2025');
  expect(mockRedirect).not.toHaveBeenCalled();
  expect(caps.canEdit).toHaveBeenCalledWith('creator');
});

// A failed upload used to vanish: the spinner stopped and the photo was gone.
it('says so when the photo upload fails, and adds no photo', async () => {
  mockCaps({ canManage: false, uid: 'creator', canEdit: true });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (pickImageAsBlob as jest.Mock).mockResolvedValueOnce({ blob: {} as Blob, filename: 'a.jpg', contentType: 'image/jpeg', previewUri: 'file://a.jpg' });
  (uploadFestivalPosterImage as jest.Mock).mockRejectedValueOnce(
    Object.assign(new Error('Max retry time exceeded'), { code: 'storage/retry-limit-exceeded' }),
  );
  const { findByTestId, queryByTestId } = render(<PosterEditScreen />);
  fireEvent.press(await findByTestId('poster-edit-images-add'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Sin conexión', expect.any(String), expect.any(Array), expect.anything()));
  expect(queryByTestId('poster-edit-images-remove-0')).toBeNull();
  alert.mockRestore();
});
