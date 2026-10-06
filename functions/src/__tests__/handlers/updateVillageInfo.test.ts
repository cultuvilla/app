// Handler test for the updateVillageInfo callable.
// While a village has no organizer (community.organizerId === null), ANY member
// can edit its basic info (description / cover images) — the "wiki phase". Once
// an organizer exists, editing consolidates to admins (+ app admins).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { updateVillageInfo } from '../../village/updateVillageInfo';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const MEMBER_ID = 'alice';
const ADMIN_ID = 'bob';
const OUTSIDER_ID = 'eve';

async function seedMunicipality(organizerId: string | null): Promise<void> {
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
      communityActive: true,
      community: { description: 'old', organizerId, organizerSex: null, profileForm: null, activatedAt: now, fiestas: [] },
    });
}

async function seedInactiveMunicipality(): Promise<void> {
  await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).set({
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
    createdAt: new Date(),
    escudoUrl: null,
    escudoThumbUrl: null,
    escudoManualUrl: null,
    communityActive: false,
    community: null,
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

interface CallableResult {
  ok: true;
}

async function callUpdate(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = ft.wrap(updateVillageInfo as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('updateVillageInfo (callable)', () => {
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
      callUpdate({ uid: null, data: { municipalityId: MUNICIPALITY_ID, description: 'x' } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws invalid-argument when municipalityId is missing', async () => {
    await expect(callUpdate({ uid: MEMBER_ID, data: { description: 'x' } })).rejects.toThrow(
      /municipalityId|invalid-argument/i,
    );
  });

  it('throws not-found when the municipality does not exist', async () => {
    await expect(
      callUpdate({ uid: MEMBER_ID, data: { municipalityId: 'missing', description: 'x' } }),
    ).rejects.toThrow(/no encontrado|not.?found/i);
  });

  it('throws failed-precondition when the community is inactive', async () => {
    await seedInactiveMunicipality();
    await seedMember(MEMBER_ID, 'user');
    await expect(
      callUpdate({ uid: MEMBER_ID, data: { municipalityId: MUNICIPALITY_ID, description: 'x' } }),
    ).rejects.toThrow(/no está activa|failed-precondition/i);
  });

  it('lets any member edit during the wiki phase (no organizer)', async () => {
    await seedMunicipality(null);
    await seedMember(MEMBER_ID, 'user');
    const result = await callUpdate({
      uid: MEMBER_ID,
      data: { municipalityId: MUNICIPALITY_ID, description: '  nueva descripción  ' },
    });
    expect(result.ok).toBe(true);
    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.community?.description).toBe('nueva descripción');
  });

  it('rejects a non-member during the wiki phase', async () => {
    await seedMunicipality(null);
    await expect(
      callUpdate({ uid: OUTSIDER_ID, data: { municipalityId: MUNICIPALITY_ID, description: 'x' } }),
    ).rejects.toThrow(/permission-denied|autoriz/i);
  });

  it('rejects an ordinary member once an organizer exists', async () => {
    await seedMunicipality(ADMIN_ID);
    await seedMember(MEMBER_ID, 'user');
    await seedMember(ADMIN_ID, 'admin');
    await expect(
      callUpdate({ uid: MEMBER_ID, data: { municipalityId: MUNICIPALITY_ID, description: 'x' } }),
    ).rejects.toThrow(/permission-denied|autoriz/i);
  });

  it('lets an admin edit once an organizer exists', async () => {
    await seedMunicipality(ADMIN_ID);
    await seedMember(ADMIN_ID, 'admin');
    const result = await callUpdate({
      uid: ADMIN_ID,
      data: { municipalityId: MUNICIPALITY_ID, description: 'editado por admin' },
    });
    expect(result.ok).toBe(true);
    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.community?.description).toBe('editado por admin');
  });
});
