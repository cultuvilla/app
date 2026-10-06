import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CommunitySettingsEditor } from '../CommunitySettingsEditor';
import {
  getMunicipality,
  updateMunicipality,
  updateCommunity,
} from '@cultuvilla/shared/services/municipalityService';

// The community editor lives in the FIRST step of the community Stepper, which
// renders only the current step — so by the time the final "Listo" button fires,
// the editor is unmounted and a deferred imperative save() no-ops. These tests
// pin the fix: edits persist immediately, while the editor is mounted.

const mockVillage = {
  id: 'm1',
  name: 'Villa',
  province: 'X',
  comunidadAutonoma: 'X',
  codigoINE: '1',
  slug: 'villa',
  nameLower: 'villa',
  createdAt: new Date(),
  escudoUrl: null,
  escudoThumbUrl: null,
  escudoManualUrl: null,
  coordinates: null,
  locationLabel: null,
  mapZoom: null,
  communityActive: true,
  community: { description: 'hola', organizerId: 'u1', organizerSex: null, profileForm: null, fiestas: [], activatedAt: new Date() },
};

jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: jest.fn(),
  updateMunicipality: jest.fn(),
  updateCommunity: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({ uploadMunicipalityImage: jest.fn() }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/dialogs', () => ({ showAlert: jest.fn() }));
jest.mock('../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
// Stub the picker with a button that fires onChange with a fixed coordinate.
jest.mock('../LocationPicker', () => ({
  LocationPicker: ({
    onChange,
  }: {
    onChange: (c: { lat: number; lng: number } | null, label: string) => void;
  }) => {
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Pressable
          accessibilityLabel="pick-loc"
          onPress={() => onChange({ lat: 40.4, lng: -3.7 }, 'Plaza Mayor, Villa')}
        >
          <Text>PICK</Text>
        </Pressable>
        <Pressable accessibilityLabel="pick-loc-unnamed" onPress={() => onChange({ lat: 40.4, lng: -3.7 }, '')}>
          <Text>PICK UNNAMED</Text>
        </Pressable>
      </>
    );
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (getMunicipality as jest.Mock).mockResolvedValue(mockVillage);
  (updateMunicipality as jest.Mock).mockResolvedValue(undefined);
  (updateCommunity as jest.Mock).mockResolvedValue(undefined);
});

describe('CommunitySettingsEditor location persistence', () => {
  it('persists a picked location immediately (not via an unmount-lost deferred save)', async () => {
    const { getByLabelText } = render(<CommunitySettingsEditor villageId="m1" />);
    const picker = await waitFor(() => getByLabelText('pick-loc'));

    fireEvent.press(picker);

    await waitFor(() => {
      expect(updateMunicipality).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({ coordinates: { lat: 40.4, lng: -3.7 } }),
      );
    });
  });

  it('stores the location name alongside the coordinate', async () => {
    const { getByLabelText } = render(<CommunitySettingsEditor villageId="m1" />);
    fireEvent.press(await waitFor(() => getByLabelText('pick-loc')));

    await waitFor(() => {
      expect(updateMunicipality).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({ locationLabel: 'Plaza Mayor, Villa' }),
      );
    });
  });

  it('stores null rather than a placeholder when the pick has no resolved name', async () => {
    const { getByLabelText } = render(<CommunitySettingsEditor villageId="m1" />);
    fireEvent.press(await waitFor(() => getByLabelText('pick-loc-unnamed')));

    await waitFor(() => {
      expect(updateMunicipality).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({ locationLabel: null }),
      );
    });
  });
});

describe('fiestas persistence', () => {
  it('saves a new fiesta block immediately, while the editor is mounted', async () => {
    const { getByTestId } = render(<CommunitySettingsEditor villageId="m1" />);
    await waitFor(() => expect(getMunicipality).toHaveBeenCalled());

    fireEvent.changeText(getByTestId('fiesta-new-name'), 'Fiestas de agosto');
    fireEvent.press(getByTestId('fiesta-add'));

    await waitFor(() =>
      expect(updateCommunity).toHaveBeenCalledWith('m1', {
        fiestas: [expect.objectContaining({ id: 'fiestas-de-agosto', name: 'Fiestas de agosto' })],
      }),
    );
  });

  it('seeds the editor from the village\'s saved blocks', async () => {
    (getMunicipality as jest.Mock).mockResolvedValue({
      ...mockVillage,
      community: {
        ...mockVillage.community,
        fiestas: [{ id: 'santiago', name: 'Santiago', anchor: { month: 7, day: 24, days: 3 }, years: {} }],
      },
    });
    const { getByTestId } = render(<CommunitySettingsEditor villageId="m1" />);
    await waitFor(() => expect(getByTestId('fiesta-santiago-name').props.value).toBe('Santiago'));
  });

  // The service rejects malformed blocks at the write boundary; the screen must
  // surface that rather than swallowing it and looking like it saved.
  it('surfaces a rejected write instead of failing silently', async () => {
    const { showAlert } = require('../../../lib/dialogs');
    (updateCommunity as jest.Mock).mockRejectedValue(new Error('fiesta blocks must have unique ids'));

    const { getByTestId } = render(<CommunitySettingsEditor villageId="m1" />);
    await waitFor(() => expect(getMunicipality).toHaveBeenCalled());
    fireEvent.changeText(getByTestId('fiesta-new-name'), 'Otra');
    fireEvent.press(getByTestId('fiesta-add'));

    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('fiesta blocks must have unique ids'));
  });
});
