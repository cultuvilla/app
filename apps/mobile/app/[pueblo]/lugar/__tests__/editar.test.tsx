import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PlaceEditScreen from '../[lugar]/editar';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', lugar: 'plaza_p1' }),
  Redirect: (props: { href: string }) => mockRedirect(props),
  router: { back: jest.fn(), replace: jest.fn() },
}));
jest.mock('../../../../lib/navigation/VillageRouteGate');
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getPlace: jest.fn(),
  updatePlace: jest.fn(),
  deletePlace: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/moderationService', () => ({
  hideContent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadPlaceImage: jest.fn(),
}));
jest.mock('../../../../components/feature/OrganizerPicker', () => {
  const { Text } = jest.requireActual('react-native');
  return { OrganizerPicker: () => <Text testID="mock-organizer-picker">contributors</Text> };
});
// The picker itself is a full-screen map + geocoder; here we only drive its
// output, so it stands in as two buttons: "pin something" and "clear the pin".
jest.mock('../../../../components/feature/LocationField', () => {
  const { Text, Pressable } = jest.requireActual('react-native');
  return {
    LocationField: ({
      onChange,
      onClear,
    }: {
      onChange: (c: { lat: number; lng: number }, a: string) => void;
      onClear?: () => void;
    }) => (
      <>
        <Pressable testID="mock-pick-location" onPress={() => onChange({ lat: 40.03, lng: -3.6 }, 'Calle Real 4')}>
          <Text>pick</Text>
        </Pressable>
        <Pressable testID="mock-clear-location" onPress={() => onClear?.()}>
          <Text>clear</Text>
        </Pressable>
      </>
    ),
  };
});

import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { getPlace, deletePlace, updatePlace } from '@cultuvilla/shared/services/municipalityService';
import { hideContent } from '@cultuvilla/shared/services/moderationService';
import { uploadPlaceImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';

const place = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Plaza',
  kind: 'cemetery',
  description: '',
  images: [],
  municipalityId: 'm1',
  proposedBy: 'creator',
  contributorUserIds: [],
  contributorOrgIds: [],
  coordinates: null,
  locationLabel: null,
  status: 'active',
  ...over,
});

/** The hook's own logic is covered in lib/auth/__tests__; here we only care
 *  that the screen asks it about the place's creator instead of `canManage`. */
function mockCaps(opts: { canManage: boolean; uid: string | null; canEdit: boolean; canDelete?: boolean }) {
  const caps = {
    canManage: opts.canManage,
    canApprove: opts.canManage,
    uid: opts.uid,
    loading: false,
    canEdit: jest.fn(() => opts.canEdit),
    canDelete: jest.fn(() => opts.canDelete ?? opts.canEdit),
  };
  (useEntityCapabilities as jest.Mock).mockReturnValue(caps);
  return caps;
}

describe('PlaceEditScreen guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPlace as jest.Mock).mockResolvedValue(place());
  });

  it('redirects to the place detail when the viewer can neither manage nor edit', async () => {
    mockCaps({ canManage: false, uid: 'u1', canEdit: false });
    render(<PlaceEditScreen />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith({ href: '/villa/lugar/plaza_p1' }));
  });

  it('lets the creator edit their own place without being a village admin', async () => {
    const caps = mockCaps({ canManage: false, uid: 'creator', canEdit: true });
    const { findByDisplayValue } = render(<PlaceEditScreen />);
    await findByDisplayValue('Plaza');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(caps.canEdit).toHaveBeenCalledWith('creator');
  });

  it('offers the creator a delete action for their own active place', async () => {
    mockCaps({ canManage: false, uid: 'creator', canEdit: true });
    const { findByLabelText } = render(<PlaceEditScreen />);
    expect(await findByLabelText('common.delete')).toBeTruthy();
  });

  it('hides the delete action when the viewer may edit but not delete', async () => {
    mockCaps({ canManage: false, uid: 'creator', canEdit: true, canDelete: false });
    const { findByDisplayValue, queryByLabelText } = render(<PlaceEditScreen />);
    await findByDisplayValue('Plaza');
    expect(queryByLabelText('common.delete')).toBeNull();
  });
});

// Two different acts wear the same trash icon: an admin *moderates* (audited
// soft-hide via the callable), a creator *withdraws* (hard delete, which the
// Firestore rules allow only while the doc is still active).
describe('PlaceEditScreen delete routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPlace as jest.Mock).mockResolvedValue(place());
  });

  async function confirmDelete(canManage: boolean) {
    mockCaps({ canManage, uid: canManage ? 'boss' : 'creator', canEdit: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { findByLabelText } = render(<PlaceEditScreen />);
    fireEvent.press(await findByLabelText('common.delete'));
    alert.mockRestore();
  }

  it('withdraws the place outright when a non-admin creator deletes it', async () => {
    await confirmDelete(false);
    await waitFor(() => expect(deletePlace).toHaveBeenCalledWith('m1', 'p1'));
    expect(hideContent).not.toHaveBeenCalled();
  });

  it('moderates through the audited callable when an admin deletes it', async () => {
    await confirmDelete(true);
    await waitFor(() =>
      expect(hideContent).toHaveBeenCalledWith({ collection: 'places', docId: 'p1', municipalityId: 'm1' }),
    );
    expect(deletePlace).not.toHaveBeenCalled();
  });
});

// A place's pin is optional and editable: pinning one saves the coordinate
// with the address the picker resolved, and clearing it takes the address with
// it so no orphan label survives on the doc.
describe('PlaceEditScreen location', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPlace as jest.Mock).mockResolvedValue(place());
    (updatePlace as jest.Mock).mockResolvedValue(undefined);
  });

  it('saves the picked coordinate together with its resolved name', async () => {
    mockCaps({ canManage: false, uid: 'creator', canEdit: true });
    const { findByTestId, getByTestId } = render(<PlaceEditScreen />);
    fireEvent.press(await findByTestId('mock-pick-location'));
    fireEvent.press(getByTestId('place-edit-submit'));
    await waitFor(() =>
      expect(updatePlace).toHaveBeenCalledWith(
        'm1',
        'p1',
        expect.objectContaining({
          coordinates: { lat: 40.03, lng: -3.6 },
          locationLabel: 'Calle Real 4',
        }),
      ),
    );
  });

  it('clears the saved name along with the pin', async () => {
    (getPlace as jest.Mock).mockResolvedValue(
      place({ coordinates: { lat: 40.03, lng: -3.6 }, locationLabel: 'Calle Real 4' }),
    );
    mockCaps({ canManage: false, uid: 'creator', canEdit: true });
    const { findByTestId, getByTestId } = render(<PlaceEditScreen />);
    fireEvent.press(await findByTestId('mock-clear-location'));
    fireEvent.press(getByTestId('place-edit-submit'));
    await waitFor(() =>
      expect(updatePlace).toHaveBeenCalledWith(
        'm1',
        'p1',
        expect.objectContaining({ coordinates: null, locationLabel: null }),
      ),
    );
  });
});

// Save is the last thing in the form: every field — including the
// contributors picker, which used to hang below the button — comes first.
describe('PlaceEditScreen layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPlace as jest.Mock).mockResolvedValue(place());
  });

  it('renders the save button after the contributors picker', async () => {
    mockCaps({ canManage: false, uid: 'creator', canEdit: true });
    const { findByTestId, toJSON } = render(<PlaceEditScreen />);
    await findByTestId('mock-organizer-picker');
    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('mock-organizer-picker')).toBeLessThan(tree.indexOf('place-edit-submit'));
  });
});

// A failed upload used to vanish: the spinner stopped and the photo was gone.
describe('PlaceEditScreen photo upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPlace as jest.Mock).mockResolvedValue(place());
  });

  it('says so when the upload fails, and keeps the place without the photo', async () => {
    mockCaps({ canManage: false, uid: 'creator', canEdit: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (pickImageAsBlob as jest.Mock).mockResolvedValueOnce({ blob: {} as Blob, filename: 'a.jpg', contentType: 'image/jpeg', previewUri: 'file://a.jpg' });
    (uploadPlaceImage as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('User does not have permission'), { code: 'storage/unauthorized' }),
    );
    const { findByTestId, queryByTestId } = render(<PlaceEditScreen />);
    fireEvent.press(await findByTestId('place-edit-images-add'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('No puedes hacer eso', expect.any(String), expect.any(Array), expect.anything()));
    expect(updatePlace).not.toHaveBeenCalled();
    expect(queryByTestId('place-edit-images-remove-0')).toBeNull();
    alert.mockRestore();
  });
});
