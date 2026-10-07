import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { geocodeSearch, reverseGeocode } from '@cultuvilla/shared/services/mapsService';
import { MapLocationPicker } from '../MapLocationPicker';

// The native MapView is absent under jest. The stub records the camera moves
// the picker asks for and exposes its region callback, so a test can play the
// user dragging the map.
const mockMap = {
  animateToRegion: jest.fn(),
  onRegionChangeComplete: null as null | ((r: { latitude: number; longitude: number }) => void),
};
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef(
    (
      props: {
        onMapReady?: () => void;
        onRegionChangeComplete?: (r: { latitude: number; longitude: number }) => void;
      },
      ref: unknown,
    ) => {
      React.useImperativeHandle(ref, () => ({ animateToRegion: mockMap.animateToRegion }));
      mockMap.onRegionChangeComplete = props.onRegionChangeComplete ?? null;
      React.useEffect(() => props.onMapReady?.(), []);
      return <View testID="location-map" />;
    },
  );
  return { __esModule: true, default: MapView, PROVIDER_GOOGLE: 'google' };
});
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/mapsService', () => ({
  geocodeSearch: jest.fn(),
  reverseGeocode: jest.fn(),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));
jest.mock('../../../lib/dialogs', () => ({ showAlert: jest.fn() }));

const mockPermission = Location.requestForegroundPermissionsAsync as jest.Mock;
const mockPosition = Location.getCurrentPositionAsync as jest.Mock;
const mockReverse = reverseGeocode as jest.Mock;
const mockSearch = geocodeSearch as jest.Mock;

const PLAZA = { lat: 40.03, lng: -3.6 };

function drag(latitude: number, longitude: number) {
  act(() => {
    mockMap.onRegionChangeComplete?.({ latitude, longitude });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockPosition.mockResolvedValue({ coords: { latitude: 39.47, longitude: -0.376 } });
  mockReverse.mockResolvedValue('Calle Colón 1, Valencia');
});

describe('MapLocationPicker', () => {
  it('opens on the saved pin and confirms it unchanged', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
    <MapLocationPicker initialCoords={PLAZA} initialLabel="Plaza Mayor" onConfirm={onConfirm} onClose={onClose} />,
    );

    expect(getByTestId('location-address')).toHaveTextContent('Plaza Mayor');
    expect(mockPosition).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('location-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(PLAZA, 'Plaza Mayor');
    expect(onClose).toHaveBeenCalled();
  });

  it('starts on the user position when there is no saved pin', async () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
    <MapLocationPicker initialCoords={null} initialLabel="" onConfirm={onConfirm} onClose={jest.fn()} />,
    );

    await waitFor(() => expect(getByTestId('location-address')).toHaveTextContent('Calle Colón 1, Valencia'));
    expect(mockMap.animateToRegion).toHaveBeenCalledWith(
    expect.objectContaining({ latitude: 39.47, longitude: -0.376 }),
    expect.any(Number),
    );

    fireEvent.press(getByTestId('location-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ lat: 39.47, lng: -0.376 }, 'Calle Colón 1, Valencia');
  });

  it('cannot confirm before any pin is chosen', async () => {
    mockPermission.mockResolvedValue({ status: 'denied' });
    const onConfirm = jest.fn();
    const { getByTestId } = render(
    <MapLocationPicker initialCoords={null} initialLabel="" onConfirm={onConfirm} onClose={jest.fn()} />,
    );

    await waitFor(() => expect(getByTestId('location-address')).toHaveTextContent('event.moveMapOrSearch'));
    fireEvent.press(getByTestId('location-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('follows the map when the user drags it', async () => {
    mockReverse.mockResolvedValue('Calle Real 4');
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <MapLocationPicker initialCoords={PLAZA} initialLabel="Plaza Mayor" onConfirm={onConfirm} onClose={jest.fn()} />,
    );

    drag(40.05, -3.62);
    await waitFor(() => expect(getByTestId('location-address')).toHaveTextContent('Calle Real 4'));

    expect(mockReverse).toHaveBeenCalledWith(40.05, -3.62);
    fireEvent.press(getByTestId('location-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ lat: 40.05, lng: -3.62 }, 'Calle Real 4');
  });

  it('ignores the map settling a few metres from the shown address', async () => {
    render(
      <MapLocationPicker initialCoords={PLAZA} initialLabel="Plaza Mayor" onConfirm={jest.fn()} onClose={jest.fn()} />,
    );

    drag(PLAZA.lat + 0.00005, PLAZA.lng);
    await act(() => new Promise((r) => setTimeout(r, 500)));

    expect(mockReverse).not.toHaveBeenCalled();
  });

  it('keeps a searched place name instead of reverse geocoding it', async () => {
    mockSearch.mockResolvedValue([{ label: 'Ermita de San Roque', lat: 40.1, lng: -3.5 }]);
    const onConfirm = jest.fn();
    const { getByTestId, findByTestId } = render(
      <MapLocationPicker initialCoords={PLAZA} initialLabel="Plaza Mayor" onConfirm={onConfirm} onClose={jest.fn()} />,
    );

    fireEvent(getByTestId('address-search-input'), 'focus');
    fireEvent.changeText(getByTestId('address-search-input'), 'ermita');
    fireEvent.press(await findByTestId('address-search-result'));

    expect(mockMap.animateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 40.1, longitude: -3.5 }),
      expect.any(Number),
    );
    // The camera lands and settles; those region events are ours, not a pick.
    drag(40.1, -3.5);
    await act(() => new Promise((r) => setTimeout(r, 500)));

    expect(mockReverse).not.toHaveBeenCalled();
    expect(getByTestId('location-address')).toHaveTextContent('Ermita de San Roque');
    fireEvent.press(getByTestId('location-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ lat: 40.1, lng: -3.5 }, 'Ermita de San Roque');
  });

  it('confirms an unnamed spot with an empty label, never coordinates', async () => {
    mockReverse.mockResolvedValue(null);
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <MapLocationPicker initialCoords={PLAZA} initialLabel="Plaza Mayor" onConfirm={onConfirm} onClose={jest.fn()} />,
    );

    drag(41, -4);
    await waitFor(() =>
      expect(getByTestId('location-address')).toHaveTextContent('event.addressUnavailable'),
    );

    fireEvent.press(getByTestId('location-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ lat: 41, lng: -4 }, '');
  });

  it('shows when a search finds nothing', async () => {
    mockSearch.mockResolvedValue([]);
    const { getByTestId, findByTestId } = render(
      <MapLocationPicker initialCoords={PLAZA} initialLabel="Plaza Mayor" onConfirm={jest.fn()} onClose={jest.fn()} />,
    );

    fireEvent(getByTestId('address-search-input'), 'focus');
    fireEvent.changeText(getByTestId('address-search-input'), 'zzzz');

    expect(await findByTestId('address-search-empty')).toHaveTextContent(/event\.noAddressResults.*zzzz/);
  });
});
