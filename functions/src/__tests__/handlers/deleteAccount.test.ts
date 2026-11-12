// Handler test for the deleteAccount callable (RGPD erasure).
// Runs against the Firestore + Auth emulators.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { deleteAccount } from '../../account/deleteAccount';
import { buildCosaData, buildCosaRequestData, buildOrganizationData } from '@cultuvilla/shared/models';

const DELETED_USER_UID = 'deleted-user';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const EVENT_ID = 'evt-1';
const NEWS_ID = 'news-1';
const USER_ID = 'user-under-test';
const CO_ADMIN_ID = 'co-admin';
const OTHER_ASKER = 'other-asker';

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
      peopleCount: 0,
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
    await db().doc('organizations/o1/chat/mine').set({ authorUid: USER_ID, authorName: 'Yo', body: 'Hola', createdAt: new Date() });
    await db().doc('organizations/o1/messages/m1/chat/mine').set({ authorUid: USER_ID, authorName: 'Yo', body: 'Voy', createdAt: new Date() });
    await db().doc('organizations/o1/tasks/t1/chat/mine').set({ authorUid: USER_ID, authorName: 'Yo', body: 'Voy', createdAt: new Date() });
    await db().doc('organizations/o1/chat/theirs').set({ authorUid: CO_ADMIN_ID, authorName: 'Otra', body: 'Hola', createdAt: new Date() });
    // The cosateca: their own cosa, a group cosa they hold, requests either way.
    const cosaBase = { municipalityId: 'mun-1', orgId: 'o1', audience: 'integrantes' as const, kind: 'prestamo' as const, category: 'otros' as const, createdBy: USER_ID };
    await db().doc('cosas/mine').set(buildCosaData({ ...cosaBase, ownerUid: USER_ID, ownerName: 'Yo', title: 'Taladro' }));
    await db().doc('cosas/group').set({
      ...buildCosaData({ ...cosaBase, ownerUid: null, ownerName: 'Peña', title: 'Carpa', createdBy: CO_ADMIN_ID }),
      heldBy: { requestId: 'asked', uid: USER_ID, name: 'Yo', untilOn: null, since: new Date() },
    });
    const reqBase = { municipalityId: 'mun-1', orgId: 'o1', cosaKind: 'prestamo' as const };
    await db().doc('cosaRequests/asked').set(buildCosaRequestData({ ...reqBase, cosaId: 'group', cosaTitle: 'Carpa', ownerUid: null, requesterUid: USER_ID, requesterName: 'Yo' }));
    await db().doc('cosaRequests/askedOfMe').set(buildCosaRequestData({ ...reqBase, cosaId: 'mine', cosaTitle: 'Taladro', ownerUid: USER_ID, requesterUid: CO_ADMIN_ID, requesterName: 'Otra' }));
    await db().doc('cosaRequests/unrelated').set(buildCosaRequestData({ ...reqBase, cosaId: 'group', cosaTitle: 'Carpa', ownerUid: null, requesterUid: CO_ADMIN_ID, requesterName: 'Otra' }));
    // A request waiting on them as a colectivizado cosa's holder goes back to the group.
    await db().doc('cosaRequests/askedOfHolder').set(buildCosaRequestData({ ...reqBase, cosaId: 'group', cosaTitle: 'Carpa', cosaMode: 'colectivizado', ownerUid: null, holderUid: USER_ID, requesterUid: CO_ADMIN_ID, requesterName: 'Otra' }));
    // A colectivizado cosa they offered belongs to the community: it passes to its group, held where it is.
    await db().doc('organizations/o2').set(buildOrganizationData({ name: 'Peña Los Amigos', type: 'peña', status: 'approved', municipalityId: 'mun-1', villageSlug: 'pueblo', requestedBy: CO_ADMIN_ID }));
    const shared = { ...cosaBase, orgId: 'o2', mode: 'colectivizado' as const, ownerUid: USER_ID, ownerName: 'Yo' };
    await db().doc('cosas/shared').set({
      ...buildCosaData({ ...shared, title: 'Escalera' }),
      heldBy: { requestId: 'passedOn', uid: CO_ADMIN_ID, name: 'Otra', untilOn: null, since: new Date() },
    });
    await db().doc('cosas/sharedHeldByMe').set({
      ...buildCosaData({ ...shared, title: 'Hormigonera' }),
      heldBy: { requestId: 'mineHeld', uid: USER_ID, name: 'Yo', untilOn: null, since: new Date() },
    });
    // ...unless its group is gone too.
    await db().doc('cosas/orphan').set(buildCosaData({ ...shared, orgId: 'gone', title: 'Remolque' }));
    await db().doc('cosaRequests/askedOfShared').set(buildCosaRequestData({ ...reqBase, orgId: 'o2', cosaId: 'shared', cosaTitle: 'Escalera', cosaMode: 'colectivizado', ownerUid: USER_ID, holderUid: CO_ADMIN_ID, requesterUid: OTHER_ASKER, requesterName: 'Tercera' }));
    // The other party's words in a request's chat go with the request; an unrelated request's stay.
    await db().doc('cosaRequests/askedOfMe/chat/c1').set({ authorUid: CO_ADMIN_ID, authorName: 'Otra', body: 'Hola', createdAt: new Date() });
    await db().doc('cosaRequests/unrelated/chat/c1').set({ authorUid: CO_ADMIN_ID, authorName: 'Otra', body: 'Hola', createdAt: new Date() });
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
    // Group chat messages, every thread; only their own.
    expect((await db().doc('organizations/o1/chat/mine').get()).exists).toBe(false);
    expect((await db().doc('organizations/o1/messages/m1/chat/mine').get()).exists).toBe(false);
    expect((await db().doc('organizations/o1/tasks/t1/chat/mine').get()).exists).toBe(false);
    expect((await db().doc('organizations/o1/chat/theirs').get()).exists).toBe(true);

    // The cosateca: own cosas and requests either way go; a held group cosa is let go.
    expect((await db().doc('cosas/mine').get()).exists).toBe(false);
    expect((await db().doc('cosas/group').get()).data()?.['heldBy']).toBeNull();
    expect((await db().doc('cosaRequests/asked').get()).exists).toBe(false);
    expect((await db().doc('cosaRequests/askedOfMe').get()).exists).toBe(false);
    expect((await db().doc('cosaRequests/unrelated').get()).exists).toBe(true);
    expect((await db().doc('cosaRequests/askedOfHolder').get()).data()).toMatchObject({ holderUid: null, status: 'pending' });
    expect((await db().doc('cosas/shared').get()).data()).toMatchObject({ ownerUid: null, ownerName: 'Peña Los Amigos', heldBy: { uid: CO_ADMIN_ID } });
    expect((await db().doc('cosas/sharedHeldByMe').get()).data()).toMatchObject({ ownerUid: null, ownerName: 'Peña Los Amigos', heldBy: null });
    expect((await db().doc('cosas/orphan').get()).exists).toBe(false);
    expect((await db().doc('cosaRequests/askedOfShared').get()).data()).toMatchObject({ ownerUid: null, holderUid: CO_ADMIN_ID, status: 'pending' });
    expect((await db().doc('cosaRequests/askedOfMe/chat/c1').get()).exists).toBe(false);
    expect((await db().doc('cosaRequests/unrelated/chat/c1').get()).exists).toBe(true);

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
