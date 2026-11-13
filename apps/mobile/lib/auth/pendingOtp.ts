import { useEffect } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { observability } from '@cultuvilla/shared';
import { routes } from '../navigation/routes';

// Reading a sign-in code means leaving for the mail app, and a phone short on
// memory closes this one meanwhile. The code step lived only in the login
// screen's state, so coming back meant the home screen as a guest. The login
// screen forgets this on unmount: every deliberate way out unmounts it, and a
// killed process never does.
const PENDING_OTP_KEY = 'cultuvilla.pendingOtp';

/** The code's own lifetime (OTP_EXPIRY_MS in functions/src/auth/sendAuthOtpCode.ts). */
export const PENDING_OTP_MAX_AGE_MS = 10 * 60 * 1000;

export async function rememberPendingOtp(email: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_OTP_KEY, JSON.stringify({ email, sentAt: Date.now() }));
}

export async function readPendingOtp(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(PENDING_OTP_KEY);
  if (!stored) return null;
  const { email, sentAt } = JSON.parse(stored) as { email: string; sentAt: number };
  if (Date.now() - sentAt <= PENDING_OTP_MAX_AGE_MS) return email;
  await clearPendingOtp();
  return null;
}

export async function clearPendingOtp(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_OTP_KEY);
}

/** Puts a guest back on the login screen they were closed out of, over the home screen. */
export function useResumePendingLogin(isGuest: boolean): void {
  useEffect(() => {
    if (!isGuest) return;
    void readPendingOtp()
      .then((email) => {
        if (email) router.push(routes.login);
      })
      .catch((err: unknown) => {
        observability.captureError(err, { operation: 'auth:resumePendingLogin' });
      });
  }, [isGuest]);
}
