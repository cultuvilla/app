import { describe, it, expect, vi, afterEach } from 'vitest';

// The handler reads the secret via .value(); stub the params module.
vi.mock('../../maps/secret', () => ({ GOOGLE_MAPS_API_KEY: { value: () => 'TEST_KEY' } }));

import { runReverseGeocode } from '../../maps/reverseGeocode';

afterEach(() => vi.restoreAllMocks());

function stubFetch(response: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(Response.json(response, { status: ok ? 200 : 500 }))),
  );
}

describe('runReverseGeocode', () => {
  it('throws invalid-argument for non-numeric coordinates', async () => {
    await expect(runReverseGeocode('40.2', -5.9)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(runReverseGeocode(Number.NaN, -5.9)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('returns the most specific label Google reports', async () => {
    stubFetch({
      status: 'OK',
      results: [
        { formatted_address: 'Calle Mayor 3, Abadía', geometry: { location: { lat: 40.2, lng: -5.9 } } },
        { formatted_address: 'España', geometry: { location: { lat: 40, lng: -5 } } },
      ],
    });
    expect(await runReverseGeocode(40.2, -5.9)).toBe('Calle Mayor 3, Abadía');
  });

  it('returns null (never a coordinate string) when Google has no match', async () => {
    stubFetch({ status: 'ZERO_RESULTS', results: [] });
    expect(await runReverseGeocode(40.2, -5.9)).toBeNull();
  });

  it('returns null when Google responds non-ok', async () => {
    stubFetch({}, false);
    expect(await runReverseGeocode(40.2, -5.9)).toBeNull();
  });
});
