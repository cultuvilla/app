// Handler test for the deleteAccount callable (RGPD erasure).
// Runs against the Firestore + Auth emulators.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { deleteAccount, isFreshAuth } from '../../account/deleteAccount';
import { buildCosaData, buildCosaRequestData, buildSocioData, buildSocioPrivateData } from '@cultuvilla/shared/models';

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
  await db().doc(`users/${uid}/notificationSettings/account`).set({ mutedTopics: ['village_news'] });
  await db().doc(`users/${uid}/privacySettings/account`).set({ usageAnalytics: true });
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

const nowSec = () => Math.floor(Date.now() / 1000);

async function callDelete(
  uid: string | null,
  opts: { data?: { reauth?: boolean }; authTime?: number } = {},
): Promise<DeleteResult> {
  const wrapped = ft.wrap(deleteAccount as unknown as Parameters<typeof ft.wrap>[0]);
  const token = opts.authTime === undefined ? {} : { auth_time: opts.authTime };
  return (await wrapped({
    data: opts.data,
    auth: uid ? { uid, token } : undefined,
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
    const cosaBase = { municipalityId: 'mun-1', orgId: 'o1', audience: 'integrantes' as const, kind: 'prestamo' as const, category: 'otros' as const, createdBy: USER_ID, createdByName: 'Yo' };
    await db().doc('cosas/mine').set(buildCosaData({ ...cosaBase, ownerUid: USER_ID, ownerName: 'Yo', title: 'Taladro' }));
    await db().doc('cosas/group').set({
      ...buildCosaData({ ...cosaBase, ownerUid: null, ownerName: 'Peña', title: 'Carpa', createdBy: CO_ADMIN_ID, createdByName: 'Otra' }),
      heldBy: { requestId: 'asked', uid: USER_ID, name: 'Yo', untilOn: null, since: new Date() },
    });
    const reqBase = { municipalityId: 'mun-1', orgId: 'o1', cosaKind: 'prestamo' as const };
    await db().doc('cosaRequests/asked').set(buildCosaRequestData({ ...reqBase, cosaId: 'group', cosaTitle: 'Carpa', ownerUid: null, requesterUid: USER_ID, requesterName: 'Yo' }));
    await db().doc('cosaRequests/askedOfMe').set(buildCosaRequestData({ ...reqBase, cosaId: 'mine', cosaTitle: 'Taladro', ownerUid: USER_ID, requesterUid: CO_ADMIN_ID, requesterName: 'Otra' }));
    await db().doc('cosaRequests/unrelated').set(buildCosaRequestData({ ...reqBase, cosaId: 'group', cosaTitle: 'Carpa', ownerUid: null, requesterUid: CO_ADMIN_ID, requesterName: 'Otra' }));
    // A request waiting on them as a shared cosa's holder goes back to the group.
    await db().doc('cosaRequests/askedOfHolder').set(buildCosaRequestData({ ...reqBase, cosaId: 'group', cosaTitle: 'Carpa', ownerUid: null, holderUid: USER_ID, requesterUid: CO_ADMIN_ID, requesterName: 'Otra' }));
    // What they gave to the group stays the group's, without their name on it.
    await db().doc('cosas/given').set({
      ...buildCosaData({ ...cosaBase, ownerUid: null, ownerName: 'Peña', title: 'Escalera', createdByName: 'Yo' }),
      heldBy: { requestId: 'passedOn', uid: CO_ADMIN_ID, name: 'Otra', untilOn: null, since: new Date() },
    });
    await db().doc('cosaRequests/askedOfGiven').set(buildCosaRequestData({ ...reqBase, cosaId: 'given', cosaTitle: 'Escalera', ownerUid: null, holderUid: CO_ADMIN_ID, requesterUid: OTHER_ASKER, requesterName: 'Tercera' }));
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
    expect((await db().doc(`users/${USER_ID}/notificationSettings/account`).get()).exists).toBe(false);
    expect((await db().doc(`users/${USER_ID}/privacySettings/account`).get()).exists).toBe(false);
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
    expect((await db().doc('cosas/group').get()).data()).toMatchObject({ heldBy: null, createdByName: 'Otra' });
    expect((await db().doc('cosaRequests/asked').get()).exists).toBe(false);
    expect((await db().doc('cosaRequests/askedOfMe').get()).exists).toBe(false);
    expect((await db().doc('cosaRequests/unrelated').get()).exists).toBe(true);
    expect((await db().doc('cosaRequests/askedOfHolder').get()).data()).toMatchObject({ holderUid: null, status: 'pending' });
    expect((await db().doc('cosas/given').get()).data()).toMatchObject({ ownerUid: null, createdBy: DELETED_USER_UID, createdByName: '', heldBy: { uid: CO_ADMIN_ID } });
    expect((await db().doc('cosaRequests/askedOfGiven').get()).data()).toMatchObject({ holderUid: CO_ADMIN_ID, status: 'pending' });
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

  it('keeps their socio rows in every group and clears the phone and email they shared', async () => {
    await seedUserDoc(USER_ID);
    await seedAuthUser(USER_ID);
    const altaAt = new Date('2024-05-01T00:00:00Z');
    const bajaAt = new Date('2025-01-10T00:00:00Z');
    // An active row in one peña, a row from a membership they already left in another.
    await db().doc('organizations/o1/socios/s1').set(
      buildSocioData({ kind: 'member', socioNumber: 7, displayName: 'Ana', uid: USER_ID, altaAt, memberJoinedAt: altaAt, createdBy: USER_ID }),
    );
    await db().doc('organizations/o2/socios/s2').set({
      ...buildSocioData({ kind: 'member', socioNumber: 3, displayName: 'Ana', uid: USER_ID, altaAt, memberJoinedAt: altaAt, createdBy: USER_ID }),
      bajaAt,
    });
    const answeredAt = new Date('2024-05-01T00:00:00Z');
    await db().doc('organizations/o1/socioPrivate/s1').set(buildSocioPrivateData({ phone: '600111222', email: 'ana@example.com', consentAnsweredAt: answeredAt }));
    await db().doc('organizations/o2/socioPrivate/s2').set(buildSocioPrivateData({ phone: '600111222', email: null, consentAnsweredAt: answeredAt }));
    // Somebody else's socio data is not theirs to erase.
    await db().doc('organizations/o1/socios/other').set(
      buildSocioData({ kind: 'typed', socioNumber: 8, displayName: 'Luis', createdBy: CO_ADMIN_ID }),
    );
    await db().doc('organizations/o1/socioPrivate/other').set(buildSocioPrivateData({ phone: '600999888', email: 'luis@example.com' }));

    await callDelete(USER_ID);

    const s1 = (await db().doc('organizations/o1/socios/s1').get()).data();
    expect(s1).toMatchObject({ socioNumber: 7, displayName: 'Ana', uid: USER_ID });
    const s2 = (await db().doc('organizations/o2/socios/s2').get()).data();
    expect(s2).toMatchObject({ socioNumber: 3, displayName: 'Ana' });
    expect(s2?.bajaAt?.toDate()).toEqual(bajaAt);

    const p1 = (await db().doc('organizations/o1/socioPrivate/s1').get()).data();
    expect(p1).toMatchObject({ phone: null, email: null });
    const p2 = (await db().doc('organizations/o2/socioPrivate/s2').get()).data();
    expect(p2).toMatchObject({ phone: null, email: null });

    const other = (await db().doc('organizations/o1/socioPrivate/other').get()).data();
    expect(other).toMatchObject({ phone: '600999888', email: 'luis@example.com' });
  });

  it('closes what the cascade registry found: private halves, requests, grants, credits and quotes', async () => {
    await seedUserDoc(USER_ID);
    await seedAuthUser(USER_ID);
    // A registration they booked and one of their persona booked by someone else, each with its private half.
    await seedRegistration(USER_ID, 'p-mine');
    await db().doc(`events/${EVENT_ID}/registrationPrivate/reg-p-mine`).set({ phone: '600111222', answers: { talla: 'M' } });
    await db().doc(`events/${EVENT_ID}/registrations/reg-p-self`).set({ userId: CO_ADMIN_ID, personId: 'p-self', personUserId: USER_ID, name: 'Ana', status: 'confirmed' });
    await db().doc(`events/${EVENT_ID}/registrationPrivate/reg-p-self`).set({ phone: '600111222' });
    await seedRegistration(CO_ADMIN_ID, 'p-other');
    await db().doc(`events/${EVENT_ID}/registrationPrivate/reg-p-other`).set({ phone: '600999888' });
    await db().doc(`events/${EVENT_ID}/seatTokens/tok-mine`).set({ registrationId: 'reg-p-mine', groupId: 'g1', createdBy: USER_ID, consumedAt: null, consumedBy: null });
    await db().doc(`organizations/o1/joinRequests/${USER_ID}`).set({ userId: USER_ID, orgId: 'o1', municipalityId: MUNICIPALITY_ID, createdAt: new Date() });
    await db().doc(`users/${USER_ID}/blockedUsers/${CO_ADMIN_ID}`).set({ blockedUserId: CO_ADMIN_ID, createdAt: new Date() });
    await db().doc(`admins/${USER_ID}`).set({ createdAt: new Date() });
    await db().doc(`censoAnswers/${MUNICIPALITY_ID}_${USER_ID}`).set({ municipalityId: MUNICIPALITY_ID, userId: USER_ID, profileAnswers: {} });
    // Authored public content stays, without the author.
    await db().doc(`municipalities/${MUNICIPALITY_ID}/places/pl1`).set({ name: 'Fuente', proposedBy: USER_ID, contributorUserIds: [USER_ID, CO_ADMIN_ID] });
    await db().doc(`municipalities/${MUNICIPALITY_ID}/barrios/b1`).set({ name: 'Arriba', proposedBy: USER_ID });
    await db().doc('festivalPosters/fp1').set({ title: 'Cartel', proposedBy: USER_ID, contributorUserIds: [USER_ID] });
    await db().doc('fiestaEditions/fe1').set({ blockId: 'b', proposedBy: USER_ID });
    await db().doc('vocabularyTerms/vt1').set({ term: 'zagal', createdBy: USER_ID, contributorUserIds: [USER_ID] });
    await db().doc('vocabularyDefinitions/vd1').set({ definition: 'chico', createdBy: CO_ADMIN_ID, contributorUserIds: [CO_ADMIN_ID, USER_ID] });
    await db().doc('historyEntries/h1').set({ title: 'La riada', createdBy: USER_ID });
    // A persona they created that another account has since claimed is that account's.
    await db().doc('persons/claimed').set({ userId: CO_ADMIN_ID, createdBy: USER_ID, firstName: 'Luis' });
    // A reply that quotes their message keeps the reply, not the quote.
    await db().doc('organizations/o1/chat/reply').set({
      authorUid: CO_ADMIN_ID,
      authorName: 'Otra',
      body: 'Sí',
      createdAt: new Date(),
      replyTo: { chatId: 'gone', authorUid: USER_ID, authorName: 'Ana', body: 'Mi número es 600111222' },
    });

    await callDelete(USER_ID);

    const exists = async (path: string) => (await db().doc(path).get()).exists;
    const data = async (path: string) => (await db().doc(path).get()).data();
    expect(await exists(`events/${EVENT_ID}/registrations/reg-p-mine`)).toBe(false);
    expect(await exists(`events/${EVENT_ID}/registrationPrivate/reg-p-mine`)).toBe(false);
    expect(await exists(`events/${EVENT_ID}/registrations/reg-p-self`)).toBe(false);
    expect(await exists(`events/${EVENT_ID}/registrationPrivate/reg-p-self`)).toBe(false);
    expect(await exists(`events/${EVENT_ID}/registrations/reg-p-other`)).toBe(true);
    expect(await exists(`events/${EVENT_ID}/registrationPrivate/reg-p-other`)).toBe(true);
    expect(await exists(`events/${EVENT_ID}/seatTokens/tok-mine`)).toBe(false);
    expect(await exists(`organizations/o1/joinRequests/${USER_ID}`)).toBe(false);
    expect(await exists(`users/${USER_ID}/blockedUsers/${CO_ADMIN_ID}`)).toBe(false);
    expect(await exists(`admins/${USER_ID}`)).toBe(false);
    expect(await exists(`censoAnswers/${MUNICIPALITY_ID}_${USER_ID}`)).toBe(false);

    expect(await data(`municipalities/${MUNICIPALITY_ID}/places/pl1`)).toMatchObject({ name: 'Fuente', proposedBy: DELETED_USER_UID, contributorUserIds: [CO_ADMIN_ID] });
    expect(await data(`municipalities/${MUNICIPALITY_ID}/barrios/b1`)).toMatchObject({ proposedBy: DELETED_USER_UID });
    expect(await data('festivalPosters/fp1')).toMatchObject({ proposedBy: DELETED_USER_UID, contributorUserIds: [] });
    expect(await data('fiestaEditions/fe1')).toMatchObject({ proposedBy: DELETED_USER_UID });
    expect(await data('vocabularyTerms/vt1')).toMatchObject({ createdBy: DELETED_USER_UID, contributorUserIds: [] });
    expect(await data('vocabularyDefinitions/vd1')).toMatchObject({ createdBy: CO_ADMIN_ID, contributorUserIds: [CO_ADMIN_ID] });
    expect(await data('historyEntries/h1')).toMatchObject({ title: 'La riada', createdBy: DELETED_USER_UID });
    expect(await data('persons/claimed')).toMatchObject({ userId: CO_ADMIN_ID, createdBy: DELETED_USER_UID });

    const reply = await data('organizations/o1/chat/reply');
    expect(reply).toMatchObject({ body: 'Sí', authorUid: CO_ADMIN_ID });
    expect(reply?.replyTo).toBeUndefined();
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

  describe('fresh-auth gate', () => {
    async function seedDeletableUser(): Promise<void> {
      await seedMunicipality(null);
      await seedVillageMember(USER_ID, 'user');
      await seedSelfPerson(USER_ID);
      await seedUserDoc(USER_ID);
      await seedAuthUser(USER_ID);
    }

    it('refuses a reauth-capable caller whose sign-in is older than 5 minutes, deleting nothing', async () => {
      await seedDeletableUser();

      const err = await callDelete(USER_ID, { data: { reauth: true }, authTime: nowSec() - 301 }).then(
        () => null,
        (e: unknown) => e as { code?: string; details?: unknown },
      );

      expect(err?.code).toBe('failed-precondition');
      expect(err?.details).toEqual({ reason: 'requires-recent-login' });
      expect((await db().doc(`persons/person-${USER_ID}`).get()).exists).toBe(true);
      expect((await db().doc(`users/${USER_ID}`).get()).exists).toBe(true);
      await expect(admin.auth().getUser(USER_ID)).resolves.toBeTruthy();
    });

    it('refuses a reauth-capable caller whose token carries no auth_time', async () => {
      await seedDeletableUser();
      await expect(callDelete(USER_ID, { data: { reauth: true } })).rejects.toMatchObject({
        code: 'failed-precondition',
        details: { reason: 'requires-recent-login' },
      });
    });

    it('deletes for a reauth-capable caller who signed in within the window', async () => {
      await seedDeletableUser();
      await expect(callDelete(USER_ID, { data: { reauth: true }, authTime: nowSec() - 30 })).resolves.toEqual({
        ok: true,
      });
      expect((await db().doc(`users/${USER_ID}`).get()).exists).toBe(false);
    });

    it('keeps the old path for a binary that sends no flag, however old its sign-in', async () => {
      await seedDeletableUser();
      await expect(callDelete(USER_ID, { authTime: nowSec() - 86_400 })).resolves.toEqual({ ok: true });
      expect((await db().doc(`users/${USER_ID}`).get()).exists).toBe(false);
    });
  });
});

describe('isFreshAuth', () => {
  const now = 1_800_000_000_000;
  const sec = now / 1000;
  it('accepts a sign-in up to 5 minutes old', () => {
    expect(isFreshAuth(sec - 300, now)).toBe(true);
    expect(isFreshAuth(sec - 301, now)).toBe(false);
  });
  it('tolerates a minute of clock skew into the future, no more', () => {
    expect(isFreshAuth(sec + 60, now)).toBe(true);
    expect(isFreshAuth(sec + 61, now)).toBe(false);
  });
  it('rejects a missing or malformed auth_time', () => {
    expect(isFreshAuth(undefined, now)).toBe(false);
    expect(isFreshAuth('123', now)).toBe(false);
    expect(isFreshAuth(Number.NaN, now)).toBe(false);
  });
});
