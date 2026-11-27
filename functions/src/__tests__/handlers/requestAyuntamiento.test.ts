// Handler test for the requestAyuntamiento callable.
// Runs against the Firestore + Auth emulators via firebase-admin and uses
// firebase-functions-test to wrap the v2 callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { wrapCallable } from '../helpers/functionsTest';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { buildMunicipalityData } from '@cultuvilla/shared/models';
import { requestAyuntamiento } from '../../organizations/requestAyuntamiento';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const USER_ID = 'alice';

async function seedMunicipality(): Promise<void> {
  await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}`)
    .set(
      buildMunicipalityData({
        name: 'Villarriba',
        province: 'Madrid',
        comunidadAutonoma: 'Madrid',
        codigoINE: '28000',
        slug: 'villarriba',
      }),
    );
}

async function seedMember(userId: string): Promise<void> {
  await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}/members/${userId}`).set({
    userId,
    role: 'user',
    joinedAt: new Date(),
    profileAnswers: {},
    profileCompletedAt: null,
  });
}

async function seedAyuntamiento(status: 'pending' | 'approved' | 'rejected'): Promise<void> {
  await admin.firestore().collection('organizations').doc(`existing-${status}`).set({
    name: 'Ayuntamiento existente',
    description: null,
    images: [],
    type: 'ayuntamiento',
    status,
    municipalityId: MUNICIPALITY_ID,
    requestedBy: 'someone',
    villageSlug: 'villarriba',
    reviewedBy: null,
    createdAt: new Date(),
    reviewedAt: null,
    commentCount: 0,
    readCount: 0,
    memberCount: 0,
    membersPublic: true,
  });
}

interface CallableResult {
  ok: true;
  orgId: string;
}

async function callRequest(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = wrapCallable(ft, requestAyuntamiento);
  return await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  });
}

describe('requestAyuntamiento (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
    await seedMunicipality();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('throws unauthenticated when no auth context', async () => {
    await expect(
      callRequest({ uid: null, data: { name: 'Ayto', municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws invalid-argument when name is missing', async () => {
    await seedMember(USER_ID);
    await expect(
      callRequest({ uid: USER_ID, data: { municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/nombre|name/i);
  });

  it('throws permission-denied when the caller is not a village member', async () => {
    await expect(
      callRequest({ uid: USER_ID, data: { name: 'Ayto', municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/perteneces|permission/i);
  });

  it('creates a pending ayuntamiento for a member when none exists', async () => {
    await seedMember(USER_ID);
    const res = await callRequest({
      uid: USER_ID,
      data: { name: 'Ayuntamiento de X', municipalityId: MUNICIPALITY_ID },
    });
    expect(res.ok).toBe(true);
    const snap = await admin.firestore().doc(`organizations/${res.orgId}`).get();
    expect(snap.data()?.type).toBe('ayuntamiento');
    expect(snap.data()?.status).toBe('pending');
    expect(snap.data()?.municipalityId).toBe(MUNICIPALITY_ID);
    expect(snap.data()?.requestedBy).toBe(USER_ID);
    expect(snap.data()?.villageSlug).toBe('villarriba');
  });

  it('rejects a second ayuntamiento when one is already pending', async () => {
    await seedMember(USER_ID);
    await seedAyuntamiento('pending');
    await expect(
      callRequest({ uid: USER_ID, data: { name: 'Otro', municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/already-exists|ya existe/i);
  });

  it('rejects a new ayuntamiento when one is already approved', async () => {
    await seedMember(USER_ID);
    await seedAyuntamiento('approved');
    await expect(
      callRequest({ uid: USER_ID, data: { name: 'Otro', municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/already-exists|ya existe/i);
  });

  it('allows a new ayuntamiento when the previous one was rejected', async () => {
    await seedMember(USER_ID);
    await seedAyuntamiento('rejected');
    const res = await callRequest({
      uid: USER_ID,
      data: { name: 'Nuevo intento', municipalityId: MUNICIPALITY_ID },
    });
    expect(res.ok).toBe(true);
  });
});
