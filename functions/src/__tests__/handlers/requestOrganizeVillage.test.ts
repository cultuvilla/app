// Handler test for the requestOrganizeVillage callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { requestOrganizeVillage } from '../../village/requestOrganizeVillage';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const USER_ID = 'alice';
const APP_ADMIN_A = 'super-1';
const APP_ADMIN_B = 'super-2';

async function seedMunicipality(
  communityActive: boolean,
  organizerId: string | null = null,
): Promise<void> {
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
      communityActive,
      community: communityActive
        ? { description: '', organizerId, organizerSex: null, profileForm: null, fiestas: [], activatedAt: now }
        : null,
    });
}

async function seedAppAdmin(uid: string): Promise<void> {
  await admin.firestore().doc(`admins/${uid}`).set({ createdAt: new Date() });
}

async function seedOrganizerRequest(opts: {
  userId: string;
  municipalityId: string;
  status: 'pending' | 'approved' | 'rejected';
}): Promise<string> {
  const ref = admin.firestore().collection('organizerRequests').doc();
  await ref.set({
    userId: opts.userId,
    municipalityId: opts.municipalityId,
    status: opts.status,
    requestedAt: new Date(),
    description: '',
    motivation: null,
    reviewedAt: null,
    reviewedBy: null,
  });
  return ref.id;
}

interface CallableResult {
  ok: true;
  requestId: string;
}

async function callRequest(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = ft.wrap(requestOrganizeVillage as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('requestOrganizeVillage (callable)', () => {
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
    await seedMunicipality(true);
    await expect(
      callRequest({ uid: null, data: { municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws invalid-argument when municipalityId is missing', async () => {
    await expect(callRequest({ uid: USER_ID, data: {} })).rejects.toThrow(/municipalityId/);
  });

  it('throws failed-precondition when the village is not started (inactive)', async () => {
    await seedMunicipality(false);
    await expect(
      callRequest({ uid: USER_ID, data: { municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/iniciar|failed-precondition/i);
  });

  it('throws already-exists when the village already has an organizer', async () => {
    await seedMunicipality(true, 'someone-else');
    await expect(
      callRequest({ uid: USER_ID, data: { municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/ya tiene embajador|already-exists/i);
  });

  it('throws already-exists when a pending request from same user for same municipality exists', async () => {
    await seedMunicipality(true);
    await seedOrganizerRequest({
      userId: USER_ID,
      municipalityId: MUNICIPALITY_ID,
      status: 'pending',
    });
    await expect(
      callRequest({ uid: USER_ID, data: { municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/pendiente|already-exists/i);
  });

  it('creates a pending organizerRequest and does not notify app admins (the pending request itself is the actionable surface)', async () => {
    await seedMunicipality(true);
    await seedAppAdmin(APP_ADMIN_A);
    await seedAppAdmin(APP_ADMIN_B);

    const result = await callRequest({
      uid: USER_ID,
      data: {
        municipalityId: MUNICIPALITY_ID,
        motivation: 'porque sí',
      },
    });
    expect(result.ok).toBe(true);
    expect(result.requestId).toBeTruthy();

    const reqDoc = await admin.firestore().doc(`organizerRequests/${result.requestId}`).get();
    expect(reqDoc.exists).toBe(true);
    expect(reqDoc.data()?.status).toBe('pending');
    expect(reqDoc.data()?.userId).toBe(USER_ID);
    expect(reqDoc.data()?.municipalityId).toBe(MUNICIPALITY_ID);
    expect(reqDoc.data()?.motivation).toBe('porque sí');

    const notifsA = await admin.firestore().collection(`users/${APP_ADMIN_A}/notifications`).get();
    const notifsB = await admin.firestore().collection(`users/${APP_ADMIN_B}/notifications`).get();
    expect(notifsA.size).toBe(0);
    expect(notifsB.size).toBe(0);
  });
});
