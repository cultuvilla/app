// Handler test for the deleteAccount callable (RGPD erasure).
// Runs against the Firestore + Auth emulators.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { deleteAccount } from '../../account/deleteAccount';

const DELETED_USER_UID = 'deleted-user';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const EVENT_ID = 'evt-1';
const NEWS_ID = 'news-1';
const USER_ID = 'user-under-test';
const CO_ADMIN_ID = 'co-admin';

function db() {
  return admin.firestore();
}

async function seedMunicipality(organizerId: string | null): Promise<void> {
  const now = new Date();
  await db()
    .doc(`municipalities/${MUNICIPALITY_ID}`)
    .set({
      name: 'Villarriba',
      nameLower: 'villarriba',
      nameAliases: [],
      localityNames: [],
      searchPrefixes: ['v', 'vi', 'vil', 'vill', 'villa', 'villar', 'villarr', 'villarri', 'villarrib', 'villarriba'],
      province: 'Madrid',
      comunidadAutonoma: 'Madrid',
      codigoINE: '28000',
      slug: 'pueblo-28000',
      coordinates: null,
      locationLabel: null,
      mapZoom: null,
      createdAt: now,
      escudoUrl: null,
      escudoThumbUrl: null,
      escudoManualUrl: null,
      communityActive: true,
      community: { organizerId, organizerSex: null, description: 'Mi pueblo', profileForm: null, activatedAt: now, fiestas: [] },
    });
}

async function seedVillageMember(uid: string, role: 'user' | 'admin'): Promise<void> {
  await db().doc(`municipalities/${MUNICIPALITY_ID}/members/${uid}`).set({
    userId: uid,
    role,
    joinedAt: new Date(),
    profileAnswers: {},
    profileCompletedAt: null,
    trustedNewsAuthor: false,
    barrioId: null,
  });
}

async function seedSelfPerson(uid: string): Promise<void> {
  await db().doc(`persons/person-${uid}`).set({
    userId: uid,
    createdBy: uid,
    firstName: 'Ana',
    municipalityId: MUNICIPALITY_ID,
  });
}

async function seedDependentPerson(id: string, createdBy: string): Promise<void> {
  await db().doc(`persons/${id}`).set({
    userId: null,
    createdBy,
    firstName: 'Hijo',
    municipalityId: MUNICIPALITY_ID,
  });
}

async function seedNews(createdBy: string): Promise<void> {
  await db().doc(`news/${NEWS_ID}`).set({
    createdBy,
    organizerUserIds: [createdBy, CO_ADMIN_ID],
    municipalityId: MUNICIPALITY_ID,
    title: 'Fiesta',
    body: 'Cuerpo',
    createdAt: new Date(),
  });
}

async function seedEvent(createdBy: string): Promise<void> {
  await db().doc(`events/${EVENT_ID}`).set({
    createdBy,
    organizerUserIds: [createdBy],
    municipalityId: MUNICIPALITY_ID,
    title: 'Concierto',
  });
}

async function seedRegistration(uid: string, personId: string): Promise<void> {
  await db().doc(`events/${EVENT_ID}/registrations/reg-${personId}`).set({
    userId: uid,
    personId,
    name: 'Ana',
    status: 'confirmed',
    position: 1,
    registeredAt: new Date(),
    isMember: true,
    checkedInAt: null,
  });
}

async function seedNotification(uid: string): Promise<void> {
  await db().doc(`users/${uid}/notifications/notif-1`).set({
    type: 'generic',
    read: false,
    createdAt: new Date(),
  });
}

// A device token addresses a push at a specific phone — personal data in its
// own right, so it must not outlive the account. Queue entries carry the uid.
async function seedPushData(uid: string): Promise<void> {
  await db().doc(`users/${uid}/devices/tok-1`).set({ token: 'tok-1', platform: 'android' });
  await db().doc(`users/${uid}/preferences/notifications`).set({ village: false });
  await db().doc(`pushQueue/${uid}__notif-1`).set({ userId: uid, notificationId: 'notif-1', sentAt: null });
  await db().doc(`pushQueue/someone-else__n`).set({ userId: 'someone-else', notificationId: 'n', sentAt: null });
}

async function seedComment(uid: string): Promise<void> {
  await db().doc('comments/comment-1').set({
    entityKind: 'news',
    entityId: NEWS_ID,
    municipalityId: MUNICIPALITY_ID,
    authorUserId: uid,
    body: 'Un comentario',
    createdAt: new Date(),
  });
}

async function seedStoragePhoto(uid: string): Promise<void> {
  await admin.storage().bucket().file(`users/${uid}/photo/avatar.jpg`).save('avatar-bytes', {
    contentType: 'image/jpeg',
  });
}

async function storageFileExists(path: string): Promise<boolean> {
  const [exists] = await admin.storage().bucket().file(path).exists();
  return exists;
}

async function seedOrganizerRequest(uid: string): Promise<void> {
  await db().doc('organizerRequests/req-1').set({
    userId: uid,
    municipalityId: MUNICIPALITY_ID,
    status: 'pending',
    createdAt: new Date(),
  });
}

async function seedUserDoc(uid: string): Promise<void> {
  await db().doc(`users/${uid}`).set({
    displayName: 'Ana',
    email: `${uid}@example.com`,
  });
}

async function seedAuthUser(uid: string): Promise<void> {
  await admin.auth().createUser({ uid, email: `${uid}@example.com` });
}

interface DeleteResult {
  ok: true;
}

async function callDelete(uid: string | null): Promise<DeleteResult> {
  const wrapped = ft.wrap(deleteAccount as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: undefined,
    auth: uid ? { uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as DeleteResult;
}

describe('deleteAccount (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('throws unauthenticated when no auth context', async () => {
    await expect(callDelete(null)).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('erases personal data, anonymizes authored content, and deletes the auth user', async () => {
    // Village with a co-admin so the user is NOT the sole admin (not blocked).
    await seedMunicipality(USER_ID);
    await seedVillageMember(USER_ID, 'admin');
    await seedVillageMember(CO_ADMIN_ID, 'admin');
    await seedSelfPerson(USER_ID);
    await seedPushData(USER_ID);
    await seedDependentPerson('dependent-1', USER_ID);
    await seedNews(USER_ID);
    await seedEvent(USER_ID);
    await seedRegistration(USER_ID, `person-${USER_ID}`);
    await seedRegistration(USER_ID, 'dependent-1');
    await seedComment(USER_ID);
    await seedStoragePhoto(USER_ID);
    await seedNotification(USER_ID);
    await seedOrganizerRequest(USER_ID);
    await seedUserDoc(USER_ID);
    await seedAuthUser(USER_ID);

    const result = await callDelete(USER_ID);
    expect(result).toEqual({ ok: true });

    // Authored news kept but anonymized.
    const newsSnap = await db().doc(`news/${NEWS_ID}`).get();
    expect(newsSnap.exists).toBe(true);
    expect(newsSnap.data()?.createdBy).toBe(DELETED_USER_UID);
    expect(newsSnap.data()?.organizerUserIds).toEqual([CO_ADMIN_ID]);

    // Authored event kept but anonymized.
    const eventSnap = await db().doc(`events/${EVENT_ID}`).get();
    expect(eventSnap.exists).toBe(true);
    expect(eventSnap.data()?.createdBy).toBe(DELETED_USER_UID);
    expect(eventSnap.data()?.organizerUserIds).toEqual([]);

    // Personal data gone.
    expect((await db().doc(`persons/person-${USER_ID}`).get()).exists).toBe(false);
    expect((await db().doc('persons/dependent-1').get()).exists).toBe(false);
    expect((await db().doc(`municipalities/${MUNICIPALITY_ID}/members/${USER_ID}`).get()).exists).toBe(
      false,
    );
    expect(
      (await db().doc(`events/${EVENT_ID}/registrations/reg-person-${USER_ID}`).get()).exists,
    ).toBe(false);
    expect((await db().doc(`events/${EVENT_ID}/registrations/reg-dependent-1`).get()).exists).toBe(
      false,
    );
    expect((await db().doc(`users/${USER_ID}/notifications/notif-1`).get()).exists).toBe(false);
    expect((await db().doc(`users/${USER_ID}/devices/tok-1`).get()).exists).toBe(false);
    expect((await db().doc(`users/${USER_ID}/preferences/notifications`).get()).exists).toBe(false);
    expect((await db().doc(`pushQueue/${USER_ID}__notif-1`).get()).exists).toBe(false);
    // Only the departing account's queue entries.
    expect((await db().doc('pushQueue/someone-else__n').get()).exists).toBe(true);
    expect((await db().doc('organizerRequests/req-1').get()).exists).toBe(false);
    expect((await db().doc(`users/${USER_ID}`).get()).exists).toBe(false);

    // Interactions (comment) hard-deleted.
    expect((await db().doc('comments/comment-1').get()).exists).toBe(false);

    // Storage photos (avatar + persona, all under users/{uid}/) purged.
    expect(await storageFileExists(`users/${USER_ID}/photo/avatar.jpg`)).toBe(false);

    // Dangling organizer pointer nulled.
    const muniSnap = await db().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniSnap.data()?.community?.organizerId).toBeNull();
    expect(muniSnap.data()?.community?.organizerSex).toBeNull();

    // A 'removed' membership event was written.
    const eventsSnap = await db()
      .collection('membershipEvents')
      .where('targetUserId', '==', USER_ID)
      .where('action', '==', 'removed')
      .get();
    expect(eventsSnap.size).toBeGreaterThanOrEqual(1);

    // Auth user deleted.
    await expect(admin.auth().getUser(USER_ID)).rejects.toThrow(/no user record|not.*found/i);
  });

  it('refuses (failed-precondition) when the caller is the sole admin, deleting nothing', async () => {
    await seedMunicipality(USER_ID);
    await seedVillageMember(USER_ID, 'admin');
    await seedSelfPerson(USER_ID);
    await seedUserDoc(USER_ID);
    await seedAuthUser(USER_ID);

    await expect(callDelete(USER_ID)).rejects.toThrow(/failed-precondition|única persona/i);

    // Nothing deleted.
    expect((await db().doc(`persons/person-${USER_ID}`).get()).exists).toBe(true);
    expect((await db().doc(`users/${USER_ID}`).get()).exists).toBe(true);
    expect((await db().doc(`municipalities/${MUNICIPALITY_ID}/members/${USER_ID}`).get()).exists).toBe(
      true,
    );
    await expect(admin.auth().getUser(USER_ID)).resolves.toBeTruthy();
  });
});
