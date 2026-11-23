import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PlacesManager } from '../PlacesManager';
import { createPlace, newPlaceId } from '@cultuvilla/shared/services/municipalityService';
import { uploadPlaceImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';

jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  newPlaceId: jest.fn().mockReturnValue('new-id'),
  createPlace: jest.fn().mockResolvedValue('new-id'),
  updatePlace: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadPlaceImage: jest.fn().mockResolvedValue('https://example.com/place.jpg'),
}));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({ useEntityCapabilities: jest.fn() }));
jest.mock('../../OrganizerPicker', () => ({ OrganizerPicker: () => null }));
// Stands in for the full-screen map picker — one button that reports a pick.
jest.mock('../../LocationField', () => {
  const { Text, Pressable } = jest.requireActual('react-native');
  return {
    LocationField: ({ onChange }: { onChange: (c: { lat: number; lng: number }, a: string) => void }) => (
      <Pressable testID="mock-pick-location" onPress={() => onChange({ lat: 40.03, lng: -3.6 }, 'Plaza Mayor 1')}>
        <Text>pick</Text>
      </Pressable>
    ),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockCaps = useEntityCapabilities as jest.Mock;
const mockPick = pickImageAsBlob as jest.Mock;

const stubImage = { blob: {} as Blob, filename: 'place.jpg', contentType: 'image/jpeg', previewUri: 'file://place.jpg' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPick.mockResolvedValue(stubImage);
  mockCaps.mockReturnValue({ canManage: false, canApprove: false, uid: 'alice', loading: false });
});

describe('<PlacesManager>', () => {
  it('any member submitting the form creates the place directly (default kind, optimistic)', async () => {
    const { getByTestId, getByText } = render(<PlacesManager villageId="m1" />);
    fireEvent.changeText(getByTestId('place-name-input'), 'Fuente');
    fireEvent.press(getByText('common.stepper.next')); // basics -> attribution
    fireEvent.press(getByTestId('place-submit')); // submit
    await waitFor(() =>
      expect(createPlace).toHaveBeenCalledWith(
        'm1',
        { name: 'Fuente', kind: 'cemetery', description: '', coordinates: null, locationLabel: null, municipalityId: 'm1', proposedBy: 'alice', images: [], contributorUserIds: ['alice'], contributorOrgIds: [] },
        'new-id',
      ),
    );
  });

  it('an admin creates the place the same way', async () => {
    mockCaps.mockReturnValue({ canManage: true, canApprove: true, uid: 'boss', loading: false });
    const { getByTestId, getByText } = render(<PlacesManager villageId="m1" />);
    fireEvent.changeText(getByTestId('place-name-input'), 'Iglesia');
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByTestId('place-submit'));
    await waitFor(() =>
      expect(createPlace).toHaveBeenCalledWith(
        'm1',
        { name: 'Iglesia', kind: 'cemetery', description: '', coordinates: null, locationLabel: null, municipalityId: 'm1', proposedBy: 'boss', images: [], contributorUserIds: ['boss'], contributorOrgIds: [] },
        'new-id',
      ),
    );
  });

  it('uploads a picked image to the minted place id and includes it in the create payload', async () => {
    const { getByTestId, getByLabelText, getByText } = render(<PlacesManager villageId="m1" />);
    fireEvent.press(getByLabelText('village.admin.places.addImage'));
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    fireEvent.changeText(getByTestId('place-name-input'), 'Fuente');
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByTestId('place-submit'));

    expect(uploadPlaceImage).toHaveBeenCalledWith('m1', 'new-id', stubImage);
    await waitFor(() =>
      expect(createPlace).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({ images: ['https://example.com/place.jpg'] }),
        'new-id',
      ),
    );
  });

  it('carries an optional pin and its resolved name into the create payload', async () => {
    const { getByTestId, getByText } = render(<PlacesManager villageId="m1" />);
    fireEvent.changeText(getByTestId('place-name-input'), 'Ermita');
    fireEvent.press(getByTestId('mock-pick-location'));
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByTestId('place-submit'));
    await waitFor(() =>
      expect(createPlace).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({
          coordinates: { lat: 40.03, lng: -3.6 },
          locationLabel: 'Plaza Mayor 1',
        }),
        'new-id',
      ),
    );
  });

  it('mints the place id up front via newPlaceId', () => {
    render(<PlacesManager villageId="m1" />);
    expect(newPlaceId).toHaveBeenCalledWith('m1');
  });
});

// A failed upload used to vanish: the spinner stopped and the photo was gone,
// with only an unhandled rejection that a release build shows nobody.
describe('<PlacesManager> photo upload', () => {
  it('says so when the upload fails, and adds no photo', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (uploadPlaceImage as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Max retry time exceeded'), { code: 'storage/retry-limit-exceeded' }),
    );
    const { getByTestId, queryByTestId } = render(<PlacesManager villageId="m1" />);
    fireEvent.press(getByTestId('place-images-add'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Sin conexión', expect.any(String), expect.any(Array), expect.anything()));
    expect(queryByTestId('place-images-remove-0')).toBeNull();
    alert.mockRestore();
  });
});
