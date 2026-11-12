import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildCosaData, buildOrganizationData } from '@cultuvilla/shared/models/organization';
import { createCosa, updateCosa } from '@cultuvilla/shared/services/cosatecaService';
import { uploadCosaImage } from '@cultuvilla/shared/services/imageService';
import { CameraPermissionDeniedError, pickImageAsBlob, takePhotoAsBlob } from '../../../../lib/images';
import { CosaSheet } from '../cosateca/CosaSheet';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({
  createCosa: jest.fn().mockResolvedValue('new'),
  updateCosa: jest.fn().mockResolvedValue(undefined),
  deleteCosa: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({ uploadCosaImage: jest.fn().mockResolvedValue('https://img/new.webp') }));
jest.mock('../../../../lib/images', () => {
  class CameraPermissionDeniedError extends Error {}
  return { pickImageAsBlob: jest.fn(), takePhotoAsBlob: jest.fn(), CameraPermissionDeniedError };
});
// Stands in for the full-screen map picker — one button that reports a pick.
jest.mock('../../LocationField', () => {
  const { Text, Pressable } = jest.requireActual('react-native');
  return {
    LocationField: ({ onChange, testID }: { onChange: (c: { lat: number; lng: number }, a: string) => void; testID?: string }) => (
      <Pressable testID={testID} onPress={() => onChange({ lat: 40.03, lng: -3.6 }, 'Plaza Mayor 1')}>
        <Text>pick</Text>
      </Pressable>
    ),
  };
});

const org = {
  id: 'ayto',
  ...buildOrganizationData({
    name: 'Ayuntamiento', type: 'ayuntamiento', municipalityId: 'm1', villageSlug: 'v', requestedBy: 'x',
    cosateca: { enabled: true, audience: 'pueblo' },
  }),
};

const sheet = (props: Partial<Parameters<typeof CosaSheet>[0]> = {}) => {
  const onClose = jest.fn();
  const utils = render(<CosaSheet visible org={org} uid="u1" myName="Ana" isAdmin={false} cosa={null} onClose={onClose} {...props} />);
  return { ...utils, onClose };
};

/** Through a new offer's first two steps: no photo, then its name. */
const toHow = (utils: ReturnType<typeof render>, title: string) => {
  fireEvent.press(utils.getByTestId('cosa-next'));
  fireEvent.changeText(utils.getByTestId('cosa-title'), title);
  fireEvent.press(utils.getByTestId('cosa-next'));
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('CosaSheet', () => {
  it('offers in three steps: the photo, what it is, and how it is shared', () => {
    const utils = sheet();
    const { getByTestId, queryByTestId } = utils;
    expect(getByTestId('cosa-step-photo')).toBeTruthy();
    expect(queryByTestId('cosa-title')).toBeNull();
    expect(getByTestId('cosa-next')).toHaveTextContent('groups.cosateca.form.noPhoto');
    fireEvent.press(getByTestId('cosa-next'));
    expect(getByTestId('cosa-step-what')).toBeTruthy();
    expect(queryByTestId('cosa-step-photo')).toBeNull();
    fireEvent.press(getByTestId('cosa-next'));
    expect(queryByTestId('cosa-step-how')).toBeNull();
    fireEvent.changeText(getByTestId('cosa-title'), 'Taladro');
    fireEvent.press(getByTestId('cosa-next'));
    expect(getByTestId('cosa-step-how')).toBeTruthy();
    expect(getByTestId('cosa-kind-prestamo')).toHaveTextContent('groups.cosateca.form.kindSentences.prestamo');
    expect(getByTestId('cosa-save')).toHaveTextContent('groups.cosateca.form.publish');
    // The header's back arrow walks back a step, then closes.
    fireEvent.press(utils.getAllByLabelText('header.back')[0]!);
    expect(getByTestId('cosa-title').props.value).toBe('Taladro');
    fireEvent.press(utils.getAllByLabelText('header.back')[0]!);
    expect(getByTestId('cosa-step-photo')).toBeTruthy();
    fireEvent.press(utils.getAllByLabelText('header.back')[0]!);
    expect(utils.onClose).toHaveBeenCalled();
  });

  it('takes the photo with the camera and moves on to what it is', async () => {
    jest.mocked(takePhotoAsBlob).mockResolvedValue({ blob: {} as Blob, filename: 'c.jpg', contentType: 'image/jpeg', previewUri: 'file://c' });
    const { getByTestId } = sheet();
    fireEvent.press(getByTestId('cosa-photo-camera'));
    await waitFor(() => expect(getByTestId('cosa-step-what')).toBeTruthy());
  });

  it('picks the photo from the gallery too', async () => {
    jest.mocked(pickImageAsBlob).mockResolvedValue({ blob: {} as Blob, filename: 'g.jpg', contentType: 'image/jpeg', previewUri: 'file://g' });
    const { getByTestId } = sheet();
    fireEvent.press(getByTestId('cosa-photo'));
    await waitFor(() => expect(getByTestId('cosa-step-what')).toBeTruthy());
  });

  it('says how to allow the camera when it is refused', async () => {
    jest.mocked(takePhotoAsBlob).mockRejectedValue(new CameraPermissionDeniedError());
    const { getByTestId } = sheet();
    fireEvent.press(getByTestId('cosa-photo-camera'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.cosateca.form.cameraDenied'));
    expect(getByTestId('cosa-step-photo')).toBeTruthy();
  });

  it('lets any integrante give a prestamo to the group, with where it is kept', async () => {
    const utils = sheet();
    const { getByTestId, onClose } = utils;
    toHow(utils, 'Taladro');
    fireEvent.press(getByTestId('cosa-owner-group'));
    fireEvent.press(getByTestId('cosa-location'));
    fireEvent.changeText(getByTestId('cosa-location-note'), ' en el garaje ');
    fireEvent.press(getByTestId('cosa-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createCosa).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'prestamo',
        ownerUid: null,
        ownerName: 'Ayuntamiento',
        createdBy: 'u1',
        createdByName: 'Ana',
        location: { coordinates: { lat: 40.03, lng: -3.6 }, displayName: 'Plaza Mayor 1' },
        locationNote: 'en el garaje',
      }),
    );
  });

  it("offers an integrante no group choice for the other kinds: those are the admins'", async () => {
    const utils = sheet();
    const { getByTestId, queryByTestId, onClose } = utils;
    toHow(utils, 'Clases de guitarra');
    fireEvent.press(getByTestId('cosa-owner-group'));
    fireEvent.press(getByTestId('cosa-kind-servicio'));
    expect(queryByTestId('cosa-owner')).toBeNull();
    fireEvent.press(getByTestId('cosa-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createCosa).toHaveBeenCalledWith(expect.objectContaining({ kind: 'servicio', ownerUid: 'u1', location: null, locationNote: null }));
  });

  it('offers a reserva with its weekly hours and limits', async () => {
    const utils = sheet({ isAdmin: true });
    const { getByTestId, onClose } = utils;
    toHow(utils, 'Pista de pádel');
    fireEvent.press(getByTestId('cosa-kind-reserva'));
    fireEvent.press(getByTestId('cosa-owner-group'));
    fireEvent.press(getByTestId('reserva-open-7'));
    fireEvent.changeText(getByTestId('reserva-slot-minutes'), '90');
    fireEvent.changeText(getByTestId('reserva-closes-1'), '21:00');
    fireEvent.changeText(getByTestId('reserva-max-active'), '3');
    fireEvent.changeText(getByTestId('reserva-horizon'), '7');
    fireEvent.press(getByTestId('reserva-requires-approval'));
    fireEvent.press(getByTestId('cosa-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createCosa).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'reserva',
        reserva: expect.objectContaining({
          slotMinutes: 90, requiresApproval: true, maxActiveReservations: 3, bookingHorizonDays: 7, blackouts: [],
        }),
      }),
    );
    const sent = jest.mocked(createCosa).mock.calls[0]?.[0];
    expect(sent?.reserva?.hours['7']).toBeNull();
    expect(sent?.reserva?.hours['1']).toEqual({ opensAt: '09:00', closesAt: '21:00' });
  });

  it('refuses a reserva whose hours do not make sense', () => {
    const utils = sheet();
    const { getByTestId } = utils;
    toHow(utils, 'Sala');
    fireEvent.press(getByTestId('cosa-kind-reserva'));
    fireEvent.changeText(getByTestId('reserva-opens-2'), '23:00');
    fireEvent.press(getByTestId('cosa-save'));
    expect(getByTestId('reserva-config-error')).toHaveTextContent('groups.cosateca.reserva.errors.order');
    expect(createCosa).not.toHaveBeenCalled();
  });

  it('never changes what kind an existing cosa is, and keeps a reserva’s closed days', async () => {
    const existing = {
      id: 'pista',
      ...buildCosaData({
        municipalityId: 'm1', orgId: 'ayto', audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', kind: 'reserva',
        title: 'Pista', category: 'deporte', createdBy: 'u1', createdByName: 'Ana',
      }),
    };
    existing.reserva = { ...existing.reserva!, blackouts: ['2026-12-25'] };
    const { getByTestId, queryByTestId, onClose } = sheet({ isAdmin: true, cosa: existing });
    expect(queryByTestId('cosa-kind')).toBeNull();
    expect(getByTestId('cosa-kind-fixed')).toBeTruthy();
    fireEvent.press(getByTestId('cosa-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateCosa).toHaveBeenCalledWith('pista', expect.objectContaining({ kind: 'reserva', reserva: expect.objectContaining({ blackouts: ['2026-12-25'] }) }));
  });

  it('never changes whose an existing prestamo is', async () => {
    const existing = {
      id: 'taladro',
      ...buildCosaData({
        municipalityId: 'm1', orgId: 'ayto', audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', kind: 'prestamo',
        title: 'Taladro', category: 'herramientas', createdBy: 'u1', createdByName: 'Ana', locationNote: 'En la peña',
      }),
    };
    const { getByTestId, queryByTestId, onClose } = sheet({ isAdmin: true, cosa: existing });
    expect(queryByTestId('cosa-owner')).toBeNull();
    expect(getByTestId('cosa-owner-fixed')).toHaveTextContent('groups.cosateca.form.ownerGroup');
    expect(getByTestId('cosa-location-note').props.value).toBe('En la peña');
    fireEvent.press(getByTestId('cosa-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateCosa).toHaveBeenCalledWith('taladro', expect.objectContaining({ locationNote: 'En la peña' }));
    expect(jest.mocked(updateCosa).mock.calls[0]?.[1]).not.toHaveProperty('ownerUid');
  });

  it('needs a name', () => {
    const { getByTestId } = sheet();
    fireEvent.press(getByTestId('cosa-next'));
    fireEvent.press(getByTestId('cosa-next'));
    expect(getByTestId('cosa-step-what')).toBeTruthy();
    expect(createCosa).not.toHaveBeenCalled();
  });

  it("offers an integrante's own, under their name, with the group's audience", async () => {
    const { getByTestId, onClose } = sheet();
    expect(getByTestId('cosa-sheet')).toBeTruthy();
    fireEvent.press(getByTestId('cosa-next'));
    expect(getByTestId('cosa-category')).toBeTruthy();
    fireEvent.changeText(getByTestId('cosa-description'), 'Con brocas');
    fireEvent.changeText(getByTestId('cosa-title'), ' Taladro ');
    fireEvent.press(getByTestId('cosa-category-herramientas'));
    fireEvent.press(getByTestId('cosa-next'));
    expect(getByTestId('cosa-kind')).toBeTruthy();
    expect(getByTestId('cosa-owner')).toBeTruthy();
    fireEvent.press(getByTestId('cosa-kind-regalo'));
    fireEvent.press(getByTestId('cosa-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createCosa).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Taladro', description: 'Con brocas', kind: 'regalo', category: 'herramientas', ownerUid: 'u1', ownerName: 'Ana', audience: 'pueblo',
        orgId: 'ayto', municipalityId: 'm1', createdBy: 'u1', imageURL: null,
      }),
    );
    expect(updateCosa).not.toHaveBeenCalled();
  });

  it("lets an admin offer it in the group's name, and gives it its photo once it exists", async () => {
    jest.mocked(pickImageAsBlob).mockResolvedValue({ blob: {} as Blob, filename: 'a.jpg', contentType: 'image/jpeg', previewUri: 'file://a' });
    const { getByTestId, onClose } = sheet({ isAdmin: true });
    fireEvent.press(getByTestId('cosa-photo-preview'));
    await waitFor(() => expect(getByTestId('cosa-step-what')).toBeTruthy());
    expect(pickImageAsBlob).toHaveBeenCalled();
    fireEvent.changeText(getByTestId('cosa-title'), 'Clases de yoga');
    fireEvent.press(getByTestId('cosa-next'));
    fireEvent.press(getByTestId('cosa-kind-servicio'));
    fireEvent.press(getByTestId('cosa-owner-group'));
    fireEvent.press(getByTestId('cosa-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createCosa).toHaveBeenCalledWith(expect.objectContaining({ kind: 'servicio', ownerUid: null, ownerName: 'Ayuntamiento' }));
    expect(uploadCosaImage).toHaveBeenCalledWith('new', 'u1', expect.objectContaining({ filename: 'a.jpg' }));
    expect(updateCosa).toHaveBeenCalledWith('new', expect.objectContaining({ imageURL: 'https://img/new.webp', status: 'available' }));
  });

  it('edits a cosa in place, keeping its state', async () => {
    const cosa = {
      id: 'c1',
      ...buildCosaData({
        municipalityId: 'm1', orgId: 'ayto', audience: 'pueblo', ownerUid: 'u1', ownerName: 'Ana', kind: 'prestamo', title: 'Carpa',
        category: 'fiestas', createdBy: 'u1', createdByName: 'Ana', imageURL: 'https://img/old.webp',
      }),
      status: 'paused' as const,
    };
    const { getByTestId, onClose } = sheet({ cosa, canDelete: true });
    expect(getByTestId('cosa-delete')).toBeTruthy();
    // Editing shows every section on one page.
    expect(getByTestId('cosa-step-photo')).toBeTruthy();
    expect(getByTestId('cosa-title').props.value).toBe('Carpa');
    expect(getByTestId('cosa-kind-fixed')).toHaveTextContent('groups.cosateca.form.kindSentences.prestamo');
    fireEvent.changeText(getByTestId('cosa-conditions'), 'Devolver seca');
    fireEvent.press(getByTestId('cosa-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateCosa).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ title: 'Carpa', conditions: 'Devolver seca', imageURL: 'https://img/old.webp', status: 'paused' }),
    );
    expect(createCosa).not.toHaveBeenCalled();
  });
});
