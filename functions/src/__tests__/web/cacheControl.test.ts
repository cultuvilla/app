import { describe, expect, it } from 'vitest';
import { cacheControlFor } from '../../web/readSite';

describe('cacheControlFor', () => {
  it('shares a normal page at the edge for an hour', () => {
    expect(cacheControlFor(200, false)).toBe('public, max-age=600, s-maxage=3600');
  });

  it('caches a 404 only briefly', () => {
    expect(cacheControlFor(404, false)).toBe('public, max-age=60, s-maxage=300');
  });

  // Hosting ignores Vary: User-Agent, so a shared copy of /descarga would hand
  // the desktop picker to the next phone that scans the printed QR.
  it('never shares a device-dependent page', () => {
    expect(cacheControlFor(200, true)).toBe('private, no-store');
  });
});
