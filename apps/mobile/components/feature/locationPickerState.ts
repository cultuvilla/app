import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import type { GeocodePlace } from '@cultuvilla/shared/services/mapsService';

export interface LocationPickerState {
  coords: LatLng | null;
  query: string;
  results: GeocodePlace[];
  status: 'idle' | 'searching' | 'error';
  /** True when `query` holds a committed selection (picked result, GPS, or the
   *  seeded value) rather than something the user is typing. Suppresses the
   *  geocode search so a chosen label doesn't immediately re-trigger results. */
  selected: boolean;
}

export type LocationAction =
  | { type: 'setQuery'; query: string }
  | { type: 'resultsLoaded'; results: GeocodePlace[] }
  | { type: 'pickResult'; place: GeocodePlace }
  | { type: 'gpsResult'; coords: LatLng }
  | { type: 'resolvedAddress'; label: string }
  | { type: 'searchFailed' }
  | { type: 'clear' };

/** A saved location: where it is, and what it's called. */
export interface LocationSeed {
  coords: LatLng | null;
  label: string;
}

/**
 * Seeds the picker from the saved location. The field shows the *name* — a
 * coordinate pair is never rendered as text anywhere in the picker, because a
 * label that reads "40.28910, -5.98760" tells the user nothing. Until a name
 * resolves, the field stays empty and shows its placeholder.
 */
export function initialLocationState(seed: LocationSeed): LocationPickerState {
  return {
    coords: seed.coords,
    query: seed.label,
    results: [],
    status: 'idle',
    selected: seed.coords != null,
  };
}

export function locationReducer(state: LocationPickerState, action: LocationAction): LocationPickerState {
  switch (action.type) {
    case 'setQuery':
      return {
        ...state,
        query: action.query,
        selected: false,
        status: action.query.trim() === '' ? 'idle' : 'searching',
      };
    case 'resultsLoaded':
      return { ...state, results: action.results, status: 'idle' };
    case 'pickResult':
      return {
        ...state,
        coords: { lat: action.place.lat, lng: action.place.lng },
        results: [],
        query: action.place.label,
        selected: true,
        status: 'idle',
      };
    case 'gpsResult':
      // The name arrives separately via `resolvedAddress` (reverse geocoding is
      // a round-trip); blank the stale query rather than showing the raw pair.
      return {
        ...state,
        coords: action.coords,
        results: [],
        query: '',
        selected: true,
        status: 'idle',
      };
    case 'resolvedAddress':
      // Reverse-geocoded label for an already-set coordinate (e.g. after GPS).
      return { ...state, query: action.label, selected: true, status: 'idle' };
    case 'searchFailed':
      return { ...state, status: 'error', results: [] };
    case 'clear':
      return { ...state, coords: null, results: [], query: '', selected: false, status: 'idle' };
    default:
      return state;
  }
}
