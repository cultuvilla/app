import { describe, it, expect } from 'vitest';
import { classifyDevice, visitFields } from '../../web/visit';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('classifyDevice', () => {
  it.each([
    [IPHONE, { device: 'phone', platform: 'ios' }],
    [ANDROID, { device: 'phone', platform: 'android' }],
    [DESKTOP, { device: 'desktop', platform: 'other' }],
    ['WhatsApp/2.24.10.78 A', { device: 'bot', platform: 'other' }],
    ['facebookexternalhit/1.1', { device: 'bot', platform: 'other' }],
    ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', { device: 'bot', platform: 'other' }],
    [null, { device: 'bot', platform: 'other' }],
  ])('%s', (ua, expected) => {
    expect(classifyDevice(ua)).toEqual(expected);
  });
});

describe('visitFields', () => {
  it('names the page and entity kind, never the path or ids', () => {
    const fields = visitFields('/matabuena/evento/fiestas_e1/', IPHONE, 200);
    expect(fields).toEqual({
      handler: 'readSite',
      page: 'entity',
      entityKind: 'event',
      device: 'phone',
      platform: 'ios',
      status: 200,
    });
    expect(JSON.stringify(fields)).not.toMatch(/matabuena|fiestas|e1/);
  });

  it('counts an org invite as an organization entity', () => {
    expect(visitFields('/matabuena/entidad/pena_o1/unirse', DESKTOP, 200)).toMatchObject({
      page: 'invite',
      entityKind: 'organization',
    });
  });

  it('carries the status of a redirect or a miss', () => {
    expect(visitFields('/descarga', ANDROID, 302)).toMatchObject({ page: 'download', entityKind: null, status: 302 });
    expect(visitFields('/', DESKTOP, 200)).toMatchObject({ page: 'home', entityKind: null });
  });
});
