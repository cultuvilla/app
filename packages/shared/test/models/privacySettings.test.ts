import { describe, expect, it } from 'vitest';
import {
  analyticsConsentGranted,
  buildPrivacySettingsData,
  PrivacySettingsDataSchema,
} from '../../src/models/user';

describe('analyticsConsentGranted', () => {
  const yes = buildPrivacySettingsData({ usageAnalytics: true });
  const no = buildPrivacySettingsData({ usageAnalytics: false });

  it('grants only a signed-in account that answered yes', () => {
    expect(analyticsConsentGranted(true, yes)).toBe(true);
  });

  it('never grants a guest, even with a stale yes in hand', () => {
    expect(analyticsConsentGranted(false, yes)).toBe(false);
    expect(analyticsConsentGranted(false, null)).toBe(false);
  });

  it('treats "never asked" and "still loading" as no', () => {
    expect(analyticsConsentGranted(true, null)).toBe(false);
    expect(analyticsConsentGranted(true, undefined)).toBe(false);
  });

  it('respects a no', () => {
    expect(analyticsConsentGranted(true, no)).toBe(false);
  });
});

describe('PrivacySettingsDataSchema', () => {
  it('requires the answer — an absent answer is an absent doc, not a field', () => {
    expect(PrivacySettingsDataSchema.safeParse({ updatedAt: new Date() }).success).toBe(false);
    expect(PrivacySettingsDataSchema.safeParse(buildPrivacySettingsData({ usageAnalytics: false })).success).toBe(true);
  });
});
