import { initialLocationState, locationReducer } from './locationPickerState';

const base = initialLocationState({ coords: null, label: '' });

describe('locationReducer', () => {
  it('setQuery updates query and marks searching', () => {
    const s = locationReducer(base, { type: 'setQuery', query: 'Aba' });
    expect(s.query).toBe('Aba');
    expect(s.status).toBe('searching');
  });

  it('resultsLoaded stores results and returns to idle', () => {
    const s = locationReducer(base, {
      type: 'resultsLoaded',
      results: [{ label: 'Abadía', lat: 40.2, lng: -5.9 }],
    });
    expect(s.results).toHaveLength(1);
    expect(s.status).toBe('idle');
  });

  it('pickResult sets coords and clears the result list', () => {
    const withResults = locationReducer(base, {
      type: 'resultsLoaded',
      results: [{ label: 'Abadía', lat: 40.2, lng: -5.9 }],
    });
    const s = locationReducer(withResults, { type: 'pickResult', place: { label: 'Abadía', lat: 40.2, lng: -5.9 } });
    expect(s.coords).toEqual({ lat: 40.2, lng: -5.9 });
    expect(s.results).toHaveLength(0);
  });

  it('gpsResult sets coords', () => {
    const s = locationReducer(base, { type: 'gpsResult', coords: { lat: 1, lng: 2 } });
    expect(s.coords).toEqual({ lat: 1, lng: 2 });
  });

  it('clear resets coords to null', () => {
    const withCoords = locationReducer(base, { type: 'gpsResult', coords: { lat: 1, lng: 2 } });
    expect(locationReducer(withCoords, { type: 'clear' }).coords).toBeNull();
  });

  it('searchFailed sets error status', () => {
    expect(locationReducer(base, { type: 'searchFailed' }).status).toBe('error');
  });

  it('seeds initial coords', () => {
    expect(initialLocationState({ coords: { lat: 1, lng: 2 }, label: '' }).coords).toEqual({ lat: 1, lng: 2 });
  });
});

// A coordinate pair rendered as text is what this picker must never show: it
// used to seed the field with `lat, lng` and persist that as the location's name.
const looksLikeCoordinates = (s: string) => /-?\d+\.\d{3,}/.test(s);

describe('location naming', () => {
  it('seeds the field with the saved name, not the coordinates', () => {
    const s = initialLocationState({ coords: { lat: 40.28911, lng: -5.98762 }, label: 'Plaza Mayor, Abadía' });
    expect(s.query).toBe('Plaza Mayor, Abadía');
    expect(s.selected).toBe(true);
  });

  it('leaves the field empty when the saved location has no name yet', () => {
    expect(initialLocationState({ coords: { lat: 40.28911, lng: -5.98762 }, label: '' }).query).toBe('');
  });

  it('never puts a coordinate string in the field after a GPS pick', () => {
    const s = locationReducer(base, { type: 'gpsResult', coords: { lat: 40.28911, lng: -5.98762 } });
    expect(looksLikeCoordinates(s.query)).toBe(false);
  });

  it('fills the name once the address resolves', () => {
    const gps = locationReducer(base, { type: 'gpsResult', coords: { lat: 40.28911, lng: -5.98762 } });
    const s = locationReducer(gps, { type: 'resolvedAddress', label: 'Calle Mayor 3, Abadía' });
    expect(s.query).toBe('Calle Mayor 3, Abadía');
    expect(s.selected).toBe(true);
  });
});
