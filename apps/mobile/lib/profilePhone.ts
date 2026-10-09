import { DEFAULT_PHONE_COUNTRY, parsePhoneE164, type PhoneCountry } from '@cultuvilla/shared/utils';
import { patchUserProfile } from '@cultuvilla/shared/services/userService';
import { observability } from '@cultuvilla/shared';

/**
 * The phone a form starts from: the account's saved number, so the user
 * verifies it instead of retyping it. Stored values are E.164;
 * parsePhoneE164 also tolerates legacy raw ones.
 */
export function initialPhone(saved: string | null | undefined): {
  country: PhoneCountry;
  national: string;
} {
  if (!saved) return { country: DEFAULT_PHONE_COUNTRY, national: '' };
  return parsePhoneE164(saved);
}

/**
 * Keeps `users/{uid}.telephone` as the last phone the user gave us, so the
 * next form that asks for it is prefilled. Runs after the action that
 * collected the phone has already succeeded, so a failure here is logged and
 * swallowed — it must never turn a confirmed sign-up into an error.
 */
export async function rememberProfilePhone(
  userId: string,
  saved: string | null | undefined,
  next: string | undefined,
  onSaved?: () => void | Promise<void>,
): Promise<void> {
  if (!next || next === saved) return;
  try {
    await patchUserProfile(userId, { telephone: next });
    await onSaved?.();
  } catch (err) {
    observability.captureError(err, { operation: 'rememberProfilePhone' });
  }
}
