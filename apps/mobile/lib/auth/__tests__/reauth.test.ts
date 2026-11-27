import { customTokenUid, reauthMethodFor } from '../reauth';

const withProviders = (ids: string[], email: string | null = 'ana@example.com') => ({
  email,
  providerData: ids.map((providerId) => ({ providerId })),
});

describe('reauthMethodFor', () => {
  it('uses Google for a Google account on either platform', () => {
    expect(reauthMethodFor(withProviders(['google.com']), 'android')).toBe('google');
    expect(reauthMethodFor(withProviders(['google.com']), 'ios')).toBe('google');
  });

  it('uses Apple only where the device can run it, else the email code', () => {
    expect(reauthMethodFor(withProviders(['apple.com']), 'ios')).toBe('apple');
    expect(reauthMethodFor(withProviders(['apple.com']), 'android')).toBe('email');
  });

  it('uses the email code for an email-code account (custom token, no provider)', () => {
    expect(reauthMethodFor(withProviders([]), 'android')).toBe('email');
  });

  it('has no way when there is no user, or no provider and no email', () => {
    expect(reauthMethodFor(null, 'ios')).toBeNull();
    expect(reauthMethodFor(withProviders(['apple.com'], null), 'android')).toBeNull();
  });
});

describe('customTokenUid', () => {
  const jwt = (claims: object) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

  it('reads the uid claim', () => {
    expect(customTokenUid(jwt({ uid: 'user-1', aud: 'x' }))).toBe('user-1');
  });

  it('returns null for anything that is not a readable token', () => {
    expect(customTokenUid('not-a-token')).toBeNull();
    expect(customTokenUid('a.%%%.c')).toBeNull();
    expect(customTokenUid(jwt({ sub: 'user-1' }))).toBeNull();
  });
});
