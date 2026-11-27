export type ReauthMethod = 'google' | 'apple' | 'email';

interface ProviderUser {
  email: string | null;
  providerData?: readonly { providerId: string }[];
}

/**
 * The way this account signs in again on this device. A federated provider
 * wins when the device can run it (Apple only on iOS); any account with an
 * email can fall back to a code, since the code sign-in resolves the account
 * by its email.
 */
export function reauthMethodFor(user: ProviderUser | null, platform: string): ReauthMethod | null {
  if (!user) return null;
  const providers = (user.providerData ?? []).map((p) => p.providerId);
  if (providers.includes('google.com')) return 'google';
  if (providers.includes('apple.com') && platform === 'ios') return 'apple';
  return user.email ? 'email' : null;
}

/** The `uid` claim of a Firebase custom token, or null when it cannot be read. */
export function customTokenUid(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { uid?: unknown };
    return typeof claims.uid === 'string' ? claims.uid : null;
  } catch {
    return null;
  }
}
