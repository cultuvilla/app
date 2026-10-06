// Handler test for the respondToOrganizerRequest callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { buildPersonData } from '@cultuvilla/shared/models';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { respondToOrganizerRequest } from '../../village/respondToOrganizerRequest';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const REQUESTER_ID = 'alice';
const APP_ADMIN_ID = 'super-1';
const OUTSIDER_ID = 'eve';

async function seedMunicipality(opts: {
  communityActive: boolean;
  organizerId?: string | null;
}): Promise<void> {
  const now = new Date();
  await admin
    .firestore()
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
      communityActive: opts.communityActive,
      // An active community always has a community object; organizerId may be
      // null (started, no organizer yet).
      community: opts.communityActive
        ? {
            organizerId: opts.organizerId ?? null, organizerSex: null,
            description: 'Mi pueblo',
            profileForm: null,
            fiestas: [],
            activatedAt: now,
          }
        : null,
    });
}

async function seedMember(uid: string, role: 'user' | 'admin'): Promise<void> {
  await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}/members/${uid}`).set({
    userId: uid,
    role,
    joinedAt: new Date(),
    profileAnswers: {},
    profileCompletedAt: null,
  });
}

async function seedAppAdmin(uid: string): Promise<void> {
  await admin.firestore().doc(`admins/${uid}`).set({ createdAt: new Date() });
}

async function seedOrganizerRequest(opts: {
  userId: string;
  municipalityId: string;
  status: 'pending' | 'approved' | 'rejected';
  description?: string;
}): Promise<string> {
  const ref = admin.firestore().collection('organizerRequests').doc();
  await ref.set({
    userId: opts.userId,
    municipalityId: opts.municipalityId,
    status: opts.status,
    requestedAt: new Date(),
    description: opts.description ?? '',
    motivation: null,
    reviewedAt: null,
    reviewedBy: null,
  });
  return ref.id;
}

interface CallableResult {
  ok: true;
}

async function callRespond(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = ft.wrap(respondToOrganizerRequest as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('respondToOrganizerRequest (callable)', () => {
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
    await expect(
      callRespond({ uid: null, data: { requestId: 'whatever', decision: 'approved' } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws permission-denied when caller is not an app admin', async () => {
    await seedMunicipality({ communityActive: false });
    const requestId = await seedOrganizerRequest({
      userId: REQUESTER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'pending',
    });
    await expect(
      callRespond({ uid: OUTSIDER_ID, data: { requestId, decision: 'approved' } }),
    ).rejects.toThrow(/superadmin|permission-denied/i);
  });

  it('throws not-found when the request does not exist', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await expect(
      callRespond({
        uid: APP_ADMIN_ID,
        data: { requestId: 'missing-id', decision: 'approved' },
      }),
    ).rejects.toThrow(/no encontrada|not.?found/i);
  });

  it('throws failed-precondition when the request is already resolved', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await seedMunicipality({ communityActive: false });
    const requestId = await seedOrganizerRequest({
      userId: REQUESTER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'approved',
    });
    await expect(
      callRespond({ uid: APP_ADMIN_ID, data: { requestId, decision: 'approved' } }),
    ).rejects.toThrow(/ya fue resuelta|failed-precondition/i);
  });

  it('throws failed-precondition when approving but the village is not started', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await seedMunicipality({ communityActive: false });
    const requestId = await seedOrganizerRequest({
      userId: REQUESTER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'pending',
    });
    await expect(
      callRespond({ uid: APP_ADMIN_ID, data: { requestId, decision: 'approved' } }),
    ).rejects.toThrow(/iniciado|failed-precondition/i);
  });

  it('throws already-exists when approving but the village already has an organizer', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await seedMunicipality({ communityActive: true, organizerId: 'someone-else' });
    const requestId = await seedOrganizerRequest({
      userId: REQUESTER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'pending',
    });
    await expect(
      callRespond({ uid: APP_ADMIN_ID, data: { requestId, decision: 'approved' } }),
    ).rejects.toThrow(/ya tiene embajador|already-exists/i);
  });

  it('approves: sets the organizer on the active community and promotes the existing member to admin', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await seedMunicipality({ communityActive: true, organizerId: null });
    await seedMember(REQUESTER_ID, 'user'); // already joined/started the village
    const requestId = await seedOrganizerRequest({
      userId: REQUESTER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'pending',
    });

    const result = await callRespond({
      uid: APP_ADMIN_ID,
      data: { requestId, decision: 'approved' },
    });
    expect(result.ok).toBe(true);

    const reqDoc = await admin.firestore().doc(`organizerRequests/${requestId}`).get();
    expect(reqDoc.data()?.status).toBe('approved');
    expect(reqDoc.data()?.reviewedBy).toBe(APP_ADMIN_ID);

    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.communityActive).toBe(true);
    expect(muniDoc.data()?.community?.organizerId).toBe(REQUESTER_ID);
    // No person doc: the title falls back to the masculine form.
    expect(muniDoc.data()?.community?.organizerSex).toBeNull();
    // Existing community info is preserved (not overwritten by the grant).
    expect(muniDoc.data()?.community?.description).toBe('Mi pueblo');

    const memberDoc = await admin
      .firestore()
      .doc(`municipalities/${MUNICIPALITY_ID}/members/${REQUESTER_ID}`)
      .get();
    expect(memberDoc.exists).toBe(true);
    expect(memberDoc.data()?.role).toBe('admin');

    const notifs = await admin
      .firestore()
      .collection(`users/${REQUESTER_ID}/notifications`)
      .get();
    expect(notifs.size).toBeGreaterThanOrEqual(1);
    expect(notifs.docs[0].data().type).toBe('organizer_request_approved');

    // Audit: organizer grant + the promotion of the existing member.
    const events = await admin.firestore().collection('membershipEvents').get();
    const actions = events.docs.map((d) => d.data().action).sort();
    expect(actions).toEqual(['organizer_set', 'role_changed']);
  });

  it('approves: creates an admin member when the requester was not yet a member', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await seedMunicipality({ communityActive: true, organizerId: null });
    const requestId = await seedOrganizerRequest({
      userId: REQUESTER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'pending',
    });

    await callRespond({ uid: APP_ADMIN_ID, data: { requestId, decision: 'approved' } });

    const memberDoc = await admin
      .firestore()
      .doc(`municipalities/${MUNICIPALITY_ID}/members/${REQUESTER_ID}`)
      .get();
    expect(memberDoc.exists).toBe(true);
    expect(memberDoc.data()?.role).toBe('admin');

    // Audit: organizer grant + the freshly-added admin member.
    const events = await admin.firestore().collection('membershipEvents').get();
    const actions = events.docs.map((d) => d.data().action).sort();
    expect(actions).toEqual(['added', 'organizer_set']);
  });

  it('approves: denormalizes the requester sex so the title reads Embajadora', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await seedMunicipality({ communityActive: true, organizerId: null });
    await admin
      .firestore()
      .doc(`persons/p-${REQUESTER_ID}`)
      .set(buildPersonData({ givenName: 'Alicia', userId: REQUESTER_ID, createdBy: REQUESTER_ID, sex: 'female' }));
    const requestId = await seedOrganizerRequest({
      userId: REQUESTER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'pending',
    });

    await callRespond({ uid: APP_ADMIN_ID, data: { requestId, decision: 'approved' } });

    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.community?.organizerSex).toBe('female');
    const notifs = await admin.firestore().collection(`users/${REQUESTER_ID}/notifications`).get();
    expect(notifs.docs[0].data().title).toBe('¡Ya eres Embajadora de Cultuvilla!');
  });

  it('rejects: sets status to rejected, leaves municipality untouched, notifies requester', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await seedMunicipality({ communityActive: false });
    const requestId = await seedOrganizerRequest({
      userId: REQUESTER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'pending',
    });

    await callRespond({
      uid: APP_ADMIN_ID,
      data: { requestId, decision: 'rejected' },
    });

    const reqDoc = await admin.firestore().doc(`organizerRequests/${requestId}`).get();
    expect(reqDoc.data()?.status).toBe('rejected');

    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.communityActive).toBe(false);

    const memberDoc = await admin
      .firestore()
      .doc(`municipalities/${MUNICIPALITY_ID}/members/${REQUESTER_ID}`)
      .get();
    expect(memberDoc.exists).toBe(false);

    const notifs = await admin
      .firestore()
      .collection(`users/${REQUESTER_ID}/notifications`)
      .get();
    expect(notifs.size).toBeGreaterThanOrEqual(1);
    expect(notifs.docs[0].data().type).toBe('organizer_request_rejected');

    // No membership events on rejection.
    const events = await admin.firestore().collection('membershipEvents').get();
    expect(events.size).toBe(0);
  });
});
