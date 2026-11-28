import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';

// The native SDK keeps the user it restored from disk after the account is
// deleted or disabled elsewhere, or its refresh token revoked (an email change
// on another device): `currentUser` stays set and every screen looks signed in,
// while each token refresh fails and every read is denied. Nothing ends that
// session but this. Only the codes after which no refresh can ever succeed
// count — a network failure must never sign out someone who opened the app
// offline.
const ORPHANED_CODES = {
  'user-not-found': 'accountGone',
  'user-disabled': 'accountGone',
  // The account still exists: telling its owner it is gone would send them
  // off to create a duplicate.
  'user-token-expired': 'sessionExpired',
} as const;

export type OrphanedReason = (typeof ORPHANED_CODES)[keyof typeof ORPHANED_CODES];

export interface OrphanedVerdict {
  reason: OrphanedReason;
  code: keyof typeof ORPHANED_CODES;
}

export function orphanedVerdictOf(error: unknown): OrphanedVerdict | null {
  const code = firebaseErrorCode(error);
  if (code === null || !Object.prototype.hasOwnProperty.call(ORPHANED_CODES, code)) return null;
  const known = code as keyof typeof ORPHANED_CODES;
  return { code: known, reason: ORPHANED_CODES[known] };
}

/**
 * Asks Auth whether the restored session can still refresh. Never rejects:
 * any answer other than an orphaned code (success, offline, an unknown error)
 * keeps the session.
 */
export async function checkRestoredSession(user: {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}): Promise<OrphanedVerdict | null> {
  try {
    await user.getIdToken(true);
    return null;
  } catch (error) {
    return orphanedVerdictOf(error);
  }
}

// Sign-out restarts the JS app, so the notice is carried across the restart
// and shown by `OrphanedSessionNotice` on the next launch.
const NOTICE_KEY = 'cultuvilla.orphanedSessionNotice';

export async function rememberOrphanedNotice(reason: OrphanedReason): Promise<void> {
  await AsyncStorage.setItem(NOTICE_KEY, reason);
}

/** The pending notice, removed as it is read so it is shown once. */
export async function takeOrphanedNotice(): Promise<OrphanedReason | null> {
  const stored = await AsyncStorage.getItem(NOTICE_KEY);
  if (stored === null) return null;
  await AsyncStorage.removeItem(NOTICE_KEY);
  return stored === 'accountGone' || stored === 'sessionExpired' ? stored : null;
}
