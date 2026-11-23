// Firestore Rules e2e test for the push surface: users/{uid}/devices/{token},
// users/{uid}/preferences/{prefId}, users/{uid}/notificationSettings/account,
// and the server-only pushQueue.
//
// A device token is what addresses a push at a specific phone, so the list is
// owner-only in both directions, and the platform/transport pairing is asserted
// here as well as in the converter — a malformed row must never reach a
// transport. pushQueue is the spool the triggers write; a client-writable one
// would let anyone send themselves (or suppress) an arbitrary push.
import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asAnon, asUser, seed } from '../helpers/roles';
import { buildNotificationSettingsData, MAX_MUTED_VILLAGES } from '../../src/models/notification';

const getEnv = useRulesTestEnv();

const OWNER = 'uid-owner';
const OTHER = 'uid-other';
const ANDROID_TOKEN = 'fcm:APA91b-android-token';
const IOS_TOKEN = 'a1b2c3d4e5f6';

const android = () => ({
  token: ANDROID_TOKEN,
  platform: 'android',
  apnsEnvironment: null,
  apnsTopic: null,
  appVersion: '1.2.0',
  createdAt: new Date(),
  lastSeenAt: new Date(),
});

const ios = () => ({
  token: IOS_TOKEN,
  platform: 'ios',
  apnsEnvironment: 'production',
  apnsTopic: 'com.cultuvilla.app',
  appVersion: '1.2.0',
  createdAt: new Date(),
  lastSeenAt: new Date(),
});

const prefs = () => ({
  mine: true,
  village: false,
  social: true,
  quietHours: true,
  updatedAt: new Date(),
});

const devicePath = (uid: string, token: string) => `users/${uid}/devices/${token}`;
const prefsPath = (uid: string) => `users/${uid}/preferences/notifications`;

describe('firestore.rules — users/{uid}/devices', () => {
  it('lets the owner register an Android device', async () => {
    await assertSucceeds(setDoc(doc(asUser(getEnv(), OWNER), devicePath(OWNER, ANDROID_TOKEN)), android()));
  });

  it('lets the owner register an iOS device carrying its APNs gateway and topic', async () => {
    await assertSucceeds(setDoc(doc(asUser(getEnv(), OWNER), devicePath(OWNER, IOS_TOKEN)), ios()));
  });

  it('lets the owner re-register the same device (idempotent refresh)', async () => {
    const db = asUser(getEnv(), OWNER);
    await assertSucceeds(setDoc(doc(db, devicePath(OWNER, ANDROID_TOKEN)), android()));
    await assertSucceeds(setDoc(doc(db, devicePath(OWNER, ANDROID_TOKEN)), android()));
  });

  it('rejects a row whose doc id is not its token', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), OWNER), devicePath(OWNER, 'other-id')), android()));
  });

  it('rejects an iOS row without an APNs gateway — it could never be delivered', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), OWNER), devicePath(OWNER, IOS_TOKEN)), { ...ios(), apnsEnvironment: null }),
    );
    await assertFails(
      setDoc(doc(asUser(getEnv(), OWNER), devicePath(OWNER, IOS_TOKEN)), { ...ios(), apnsTopic: '' }),
    );
  });

  it('rejects an Android row that claims APNs fields', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), OWNER), devicePath(OWNER, ANDROID_TOKEN)), {
        ...android(),
        apnsEnvironment: 'production',
      }),
    );
  });

  it('rejects an unknown platform and extra keys', async () => {
    const db = asUser(getEnv(), OWNER);
    await assertFails(setDoc(doc(db, devicePath(OWNER, ANDROID_TOKEN)), { ...android(), platform: 'web' }));
    await assertFails(setDoc(doc(db, devicePath(OWNER, ANDROID_TOKEN)), { ...android(), extra: 1 }));
  });

  it('denies another user reading, listing, writing or deleting someone’s devices', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), devicePath(OWNER, ANDROID_TOKEN)), android());
    });
    const db = asUser(getEnv(), OTHER);
    await assertFails(getDoc(doc(db, devicePath(OWNER, ANDROID_TOKEN))));
    await assertFails(getDocs(collection(db, `users/${OWNER}/devices`)));
    await assertFails(setDoc(doc(db, devicePath(OWNER, ANDROID_TOKEN)), android()));
    await assertFails(deleteDoc(doc(db, devicePath(OWNER, ANDROID_TOKEN))));
  });

  it('denies an anonymous client', async () => {
    await assertFails(getDocs(collection(asAnon(getEnv()), `users/${OWNER}/devices`)));
  });

  it('lets the owner delete their device on sign-out', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), devicePath(OWNER, ANDROID_TOKEN)), android());
    });
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), OWNER), devicePath(OWNER, ANDROID_TOKEN))));
  });
});

describe('firestore.rules — users/{uid}/preferences', () => {
  it('lets the owner write and read their notification preferences', async () => {
    const db = asUser(getEnv(), OWNER);
    await assertSucceeds(setDoc(doc(db, prefsPath(OWNER)), prefs()));
    await assertSucceeds(getDoc(doc(db, prefsPath(OWNER))));
  });

  it('only allows the one known preferences doc', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), OWNER), `users/${OWNER}/preferences/other`), prefs()));
  });

  it('rejects a partial or mistyped preferences doc', async () => {
    const db = asUser(getEnv(), OWNER);
    const { village: _dropped, ...partial } = prefs();
    await assertFails(setDoc(doc(db, prefsPath(OWNER)), partial));
    await assertFails(setDoc(doc(db, prefsPath(OWNER)), { ...prefs(), mine: 'yes' }));
  });

  it('denies another user reading or writing someone’s preferences', async () => {
    const db = asUser(getEnv(), OTHER);
    await assertFails(getDoc(doc(db, prefsPath(OWNER))));
    await assertFails(setDoc(doc(db, prefsPath(OWNER)), prefs()));
  });
});

describe('firestore.rules — users/{uid}/notificationSettings', () => {
  const settingsPath = (uid: string) => `users/${uid}/notificationSettings/account`;
  const settings = () => buildNotificationSettingsData({ mutedTopics: ['village_news'], mutedVillages: ['mun1'] });

  it('lets the owner write and read their switches', async () => {
    const db = asUser(getEnv(), OWNER);
    await assertSucceeds(setDoc(doc(db, settingsPath(OWNER)), settings()));
    await assertSucceeds(getDoc(doc(db, settingsPath(OWNER))));
  });

  it('only allows the one account doc', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), OWNER), `users/${OWNER}/notificationSettings/other`), settings()));
  });

  it('rejects a partial, mistyped or oversized doc', async () => {
    const db = asUser(getEnv(), OWNER);
    const { mutedVillages: _dropped, ...partial } = settings();
    await assertFails(setDoc(doc(db, settingsPath(OWNER)), partial));
    await assertFails(setDoc(doc(db, settingsPath(OWNER)), { ...settings(), quietHours: 'yes' }));
    await assertFails(setDoc(doc(db, settingsPath(OWNER)), { ...settings(), mutedTopics: 'village_news' }));
    await assertFails(setDoc(doc(db, settingsPath(OWNER)), {
      ...settings(),
      mutedVillages: Array.from({ length: MAX_MUTED_VILLAGES + 1 }, (_, i) => `m${String(i)}`),
    }));
  });

  it('denies another user reading or writing someone’s switches', async () => {
    const db = asUser(getEnv(), OTHER);
    await assertFails(getDoc(doc(db, settingsPath(OWNER))));
    await assertFails(setDoc(doc(db, settingsPath(OWNER)), settings()));
  });
});

describe('firestore.rules — pushQueue', () => {
  const entry = () => ({
    userId: OWNER,
    notificationId: 'n1',
    category: 'mine',
    sendAfter: new Date(),
    createdAt: new Date(),
    sentAt: null,
    deliveredCount: 0,
    failedCount: 0,
  });

  it('denies every client, app admins included, in both directions', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pushQueue/${OWNER}__n1`), entry());
    });
    const adminDb = await asAdmin(getEnv(), 'uid-admin');
    for (const db of [asUser(getEnv(), OWNER), adminDb]) {
      await assertFails(getDoc(doc(db, `pushQueue/${OWNER}__n1`)));
      await assertFails(getDocs(collection(db, 'pushQueue')));
      await assertFails(setDoc(doc(db, `pushQueue/${OWNER}__n2`), entry()));
      await assertFails(deleteDoc(doc(db, `pushQueue/${OWNER}__n1`)));
    }
  });
});
