import { describe, it, expect, vi, afterEach } from 'vitest';

// The handler reads the secret via .value(); stub the params module.
vi.mock('../../maps/secret', () => ({ GOOGLE_MAPS_API_KEY: { value: () => 'TEST_KEY' } }));

import { runGeocodeSearch } from '../../maps/geocodeSearch';

afterEach(() => vi.restoreAllMocks());

describe('runGeocodeSearch', () => {
  it('throws invalid-argument for empty/whitespace query', async () => {
    await expect(runGeocodeSearch('   ')).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('returns mapped results on success', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(Response.json({
      status: 'OK',
      results: [{ formatted_address: 'Abadía', geometry: { location: { lat: 40.2, lng: -5.9 } } }],
    }))));
    const results = await runGeocodeSearch('Abadía');
    expect(results).toEqual([{ label: 'Abadía', lat: 40.2, lng: -5.9 }]);
  });

  it('returns [] when Google responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(Response.json({}, { status: 500 }))));
    expect(await runGeocodeSearch('Abadía')).toEqual([]);
  });
});
