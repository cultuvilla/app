import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FestivalPostersManager } from '../FestivalPostersManager';
import { createFestivalPoster } from '@cultuvilla/shared/services/festivalPosterService';
import { uploadFestivalPosterImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';

jest.mock('@cultuvilla/shared/services/festivalPosterService', () => ({
  newFestivalPosterId: jest.fn().mockReturnValue('new-id'),
  createFestivalPoster: jest.fn().mockResolvedValue('new-id'),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadFestivalPosterImage: jest.fn().mockResolvedValue('https://example.com/poster.jpg'),
}));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({ useEntityCapabilities: jest.fn() }));
jest.mock('../../OrganizerPicker', () => ({ OrganizerPicker: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockCaps = useEntityCapabilities as jest.Mock;
const mockPick = pickImageAsBlob as jest.Mock;

const stubImage = { blob: {} as Blob, filename: 'poster.jpg', contentType: 'image/jpeg', previewUri: 'file://poster.jpg' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPick.mockResolvedValue(stubImage);
  mockCaps.mockReturnValue({ canManage: false, canApprove: false, uid: 'alice', loading: false });
});

describe('<FestivalPostersManager>', () => {
  it('any member submitting the form creates the poster directly (year precision, optimistic)', async () => {
    const { getByTestId, getByLabelText, getByText } = render(<FestivalPostersManager villageId="m1" />);
    fireEvent.press(getByLabelText('village.festivalPosters.form.addImage'));
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    fireEvent.changeText(getByTestId('poster-year-input'), '2026');
    fireEvent.press(getByText('common.stepper.next')); // basics -> dates
    fireEvent.press(getByText('common.stepper.next')); // dates -> attribution
    fireEvent.press(getByTestId('poster-submit')); // submit

    await waitFor(() =>
      expect(createFestivalPoster).toHaveBeenCalledWith(
        expect.objectContaining({
          municipalityId: 'm1',
          proposedBy: 'alice',
          contributorUserIds: ['alice'],
          contributorOrgIds: [],
          year: 2026,
          datePrecision: 'year',
          startsAt: null,
          endsAt: null,
          images: ['https://example.com/poster.jpg'],
        }),
        'new-id',
      ),
    );
    // The service stamps villageSlug from the municipality; the form must not invent one.
    expect((createFestivalPoster as jest.Mock).mock.calls[0][0]).not.toHaveProperty('villageSlug');
    expect(uploadFestivalPosterImage).toHaveBeenCalledWith('m1', 'new-id', stubImage);
  });

  it('an admin creates the poster the same way', async () => {
    mockCaps.mockReturnValue({ canManage: true, canApprove: true, uid: 'boss', loading: false });
    const { getByTestId, getByLabelText, getByText } = render(<FestivalPostersManager villageId="m1" />);
    fireEvent.press(getByLabelText('village.festivalPosters.form.addImage'));
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    fireEvent.changeText(getByTestId('poster-year-input'), '2027');
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByTestId('poster-submit'));

    await waitFor(() =>
      expect(createFestivalPoster).toHaveBeenCalledWith(
        expect.objectContaining({ municipalityId: 'm1', year: 2027, datePrecision: 'year' }),
        'new-id',
      ),
    );
  });

  // A failed upload used to vanish: the spinner stopped and the photo was gone,
  // with only an unhandled rejection that a release build shows nobody.
  it('says so when the photo upload fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (uploadFestivalPosterImage as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('User does not have permission'), { code: 'storage/unauthorized' }),
    );
    const { getByLabelText } = render(<FestivalPostersManager villageId="m1" />);
    fireEvent.press(getByLabelText('village.festivalPosters.form.addImage'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('No puedes hacer eso', expect.any(String), expect.any(Array), expect.anything()));
    alert.mockRestore();
  });
});
