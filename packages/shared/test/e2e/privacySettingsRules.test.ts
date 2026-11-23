// Firestore Rules e2e test for users/{uid}/privacySettings/account: the
// account's answer on usage analytics. Owner-only in both directions, one doc,
// and always whole — an absent doc means "not asked yet", so a partial one
// would be a state the app cannot read.
import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAnon, asUser } from '../helpers/roles';
import { buildPrivacySettingsData } from '../../src/models/user';

const getEnv = useRulesTestEnv();

const OWNER = 'uid-owner';
const OTHER = 'uid-other';
const path = (uid: string) => `users/${uid}/privacySettings/account`;

describe('firestore.rules — users/{uid}/privacySettings', () => {
  it('lets the owner answer yes or no, change it, and read it', async () => {
    const db = asUser(getEnv(), OWNER);
    await assertSucceeds(setDoc(doc(db, path(OWNER)), buildPrivacySettingsData({ usageAnalytics: true })));
    await assertSucceeds(setDoc(doc(db, path(OWNER)), buildPrivacySettingsData({ usageAnalytics: false })));
    await assertSucceeds(getDoc(doc(db, path(OWNER))));
  });

  it('only allows the one account doc', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), OWNER), `users/${OWNER}/privacySettings/other`), buildPrivacySettingsData({ usageAnalytics: true })),
    );
  });

  it('rejects a partial, mistyped or padded doc', async () => {
    const db = asUser(getEnv(), OWNER);
    await assertFails(setDoc(doc(db, path(OWNER)), { usageAnalytics: true }));
    await assertFails(setDoc(doc(db, path(OWNER)), { usageAnalytics: 'yes', updatedAt: new Date() }));
    await assertFails(setDoc(doc(db, path(OWNER)), { ...buildPrivacySettingsData({ usageAnalytics: true }), extra: 1 }));
  });

  it('denies another user and a guest', async () => {
    for (const db of [asUser(getEnv(), OTHER), asAnon(getEnv())]) {
      await assertFails(getDoc(doc(db, path(OWNER))));
      await assertFails(setDoc(doc(db, path(OWNER)), buildPrivacySettingsData({ usageAnalytics: true })));
    }
  });
});
