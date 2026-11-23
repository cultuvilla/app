import { z } from 'zod';

/**
 * The account's privacy choices at `users/{uid}/privacySettings/account`. Today
 * one: whether usage analytics (Google Analytics for Firebase) may run.
 *
 * **The doc is optional, and its absence carries meaning: "not asked yet".**
 * Analytics rests on opt-in consent (Privacy Policy §4, art. 6.1.a RGPD), so a
 * missing answer must never read as yes — and it must not read as a stored no
 * either, or an account that was never asked would never see the question. A
 * required field on `users/{uid}` would have needed a backfill inventing an
 * answer nobody gave; a doc that does not exist yet needs nothing.
 *
 * Its own doc rather than a field on `preferences/notifications` or
 * `notificationSettings/account`: installed binaries write both of those with a
 * full `setDoc`, which would wipe a field they do not know.
 */
export const PrivacySettingsDataSchema = z.object({
  usageAnalytics: z.boolean(),
  updatedAt: z.date(),
});
export type PrivacySettingsData = z.infer<typeof PrivacySettingsDataSchema>;

export const PRIVACY_SETTINGS_DOC_ID = 'account';

export interface PrivacySettingsDataInput {
  usageAnalytics: boolean;
  updatedAt?: Date;
}

export function buildPrivacySettingsData(input: PrivacySettingsDataInput): PrivacySettingsData {
  return {
    usageAnalytics: input.usageAnalytics,
    updatedAt: input.updatedAt ?? new Date(),
  };
}

/**
 * Whether analytics may collect for this session. Only a signed-in account that
 * answered yes; a guest, a session still loading its answer, an account never
 * asked and one that said no all collect nothing.
 */
export function analyticsConsentGranted(
  signedIn: boolean,
  settings: PrivacySettingsData | null | undefined,
): boolean {
  return signedIn && settings?.usageAnalytics === true;
}
