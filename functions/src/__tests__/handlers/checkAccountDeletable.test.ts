// Handler test for the checkAccountDeletable callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { checkAccountDeletable } from '../../account/checkAccountDeletable';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const ORG_ID = 'org-1';
const SOLE_ADMIN_ID = 'sole-admin';
const OTHER_ID = 'other';

async function seedMunicipality(): Promise<void> {
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
      community: { organizerId: SOLE_ADMIN_ID, organizerSex: null, description: 'Mi pueblo', profileForm: null, activatedAt: now, fiestas: [] },
    });
}

async function seedVillageMember(uid: string, role: 'user' | 'admin'): Promise<void> {
  await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}/members/${uid}`).set({
    userId: uid,
    role,
    joinedAt: new Date(),
    profileAnswers: {},
    profileCompletedAt: null,
    trustedNewsAuthor: false,
    barrioId: null,
  });
}

async function seedOrg(): Promise<void> {
  await admin.firestore().doc(`organizations/${ORG_ID}`).set({
    name: 'Peña',
    description: null,
    images: [],
    type: 'peña',
    status: 'approved',
    municipalityId: MUNICIPALITY_ID,
    requestedBy: SOLE_ADMIN_ID,
    villageSlug: 'villarriba',
    reviewedBy: 'someone',
    createdAt: new Date(),
    reviewedAt: new Date(),
    commentCount: 0,
    readCount: 0,
    memberCount: 0,
    membersPublic: true,
  });
}

async function seedOrgMember(uid: string, role: 'admin' | 'member'): Promise<void> {
  await admin.firestore().doc(`organizations/${ORG_ID}/members/${uid}`).set({
    userId: uid,
    joinedAt: new Date(),
    role,
  });
}

interface CallableResult {
  blockers: Array<{ scopeType: 'village' | 'org'; scopeId: string; name: string }>;
}

async function callCheck(uid: string | null): Promise<CallableResult> {
  const wrapped = ft.wrap(checkAccountDeletable as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: undefined,
    auth: uid ? { uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('checkAccountDeletable (callable)', () => {
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
    await expect(callCheck(null)).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('returns no blockers when the caller has no admin memberships', async () => {
    await seedMunicipality();
    await seedVillageMember(OTHER_ID, 'user');
    const result = await callCheck(OTHER_ID);
    expect(result.blockers).toHaveLength(0);
  });

  it('flags a village where the caller is the sole admin', async () => {
    await seedMunicipality();
    await seedVillageMember(SOLE_ADMIN_ID, 'admin');
    const result = await callCheck(SOLE_ADMIN_ID);
    expect(result.blockers).toEqual([
      { scopeType: 'village', scopeId: MUNICIPALITY_ID, name: 'Villarriba' },
    ]);
  });

  it('does not flag a village with a second admin', async () => {
    await seedMunicipality();
    await seedVillageMember(SOLE_ADMIN_ID, 'admin');
    await seedVillageMember(OTHER_ID, 'admin');
    const result = await callCheck(SOLE_ADMIN_ID);
    expect(result.blockers).toHaveLength(0);
  });

  it('flags an org where the caller is the sole admin', async () => {
    await seedOrg();
    await seedOrgMember(SOLE_ADMIN_ID, 'admin');
    const result = await callCheck(SOLE_ADMIN_ID);
    expect(result.blockers).toEqual([{ scopeType: 'org', scopeId: ORG_ID, name: 'Peña' }]);
  });

  it('does not flag an org with a second admin', async () => {
    await seedOrg();
    await seedOrgMember(SOLE_ADMIN_ID, 'admin');
    await seedOrgMember(OTHER_ID, 'admin');
    const result = await callCheck(SOLE_ADMIN_ID);
    expect(result.blockers).toHaveLength(0);
  });

  it('flags both a village and an org when the caller is sole admin of each', async () => {
    await seedMunicipality();
    await seedVillageMember(SOLE_ADMIN_ID, 'admin');
    await seedOrg();
    await seedOrgMember(SOLE_ADMIN_ID, 'admin');
    const result = await callCheck(SOLE_ADMIN_ID);
    expect(result.blockers).toHaveLength(2);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        { scopeType: 'village', scopeId: MUNICIPALITY_ID, name: 'Villarriba' },
        { scopeType: 'org', scopeId: ORG_ID, name: 'Peña' },
      ]),
    );
  });
});
