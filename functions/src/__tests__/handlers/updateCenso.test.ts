// Handler test for the updateCenso callable.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { updateCenso } from '../../census/updateCenso';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MID = 'mun-1';
const ADMIN_ID = 'admin-1';
const MEMBER_ID = 'member-1';

async function seedCensoMunicipality(fields: unknown[]): Promise<void> {
  const now = new Date();
  await admin.firestore().doc(`municipalities/${MID}`).set({
    name: 'Villarriba', nameLower: 'villarriba', province: 'Madrid',
    nameAliases: [],
    localityNames: [],
    searchPrefixes: ['v', 'vi', 'vil', 'vill', 'villa', 'villar', 'villarr', 'villarri', 'villarrib', 'villarriba'],
    comunidadAutonoma: 'Madrid', codigoINE: '28000', slug: 'pueblo-28000', coordinates: null,
    locationLabel: null,
    mapZoom: null,
    createdAt: now, escudoUrl: null, escudoThumbUrl: null, escudoManualUrl: null,
    communityActive: true,
    community: { organizerId: ADMIN_ID, organizerSex: null, description: 'x', activatedAt: now, fiestas: [],
      profileForm: { fields, updatedAt: now } },
  });
}

async function seedMember(uid: string, role: 'user' | 'admin', profileAnswers: Record<string, unknown>): Promise<void> {
  await admin.firestore().doc(`municipalities/${MID}/members/${uid}`).set({
    userId: uid, role, joinedAt: new Date(), profileAnswers: {},
    profileCompletedAt: null,
  });
  if (Object.keys(profileAnswers).length === 0) return;
  await admin.firestore().doc(`censoAnswers/${MID}_${uid}`).set({
    municipalityId: MID, userId: uid, profileAnswers, updatedAt: new Date(),
  });
}

function call(uid: string, fields: unknown[]): Promise<unknown> {
  const wrapped = ft.wrap(updateCenso as unknown as Parameters<typeof ft.wrap>[0]);
  return Promise.resolve(
    wrapped({ data: { municipalityId: MID, fields }, auth: { uid } } as unknown as Parameters<typeof wrapped>[0]),
  );
}

describe('updateCenso — removing an answered question', () => {
  beforeAll(async () => { await resetEmulators(); });
  beforeEach(async () => { await resetEmulators(); });
  afterAll(() => { ft.cleanup(); });

  it('erases the removed field from member answers and keeps the others', async () => {
    const fieldA = { source: 'custom', key: 'color', label: 'Color', type: 'text', required: false };
    const fieldB = { source: 'custom', key: 'edad', label: 'Edad', type: 'number', required: false };
    await seedCensoMunicipality([fieldA, fieldB]);
    await seedMember(ADMIN_ID, 'admin', {});
    await seedMember(MEMBER_ID, 'user', { color: 'rojo', edad: 30 });

    // Remove fieldA (color); keep fieldB (edad).
    await call(ADMIN_ID, [fieldB]);

    const mun = await admin.firestore().doc(`municipalities/${MID}`).get();
    const savedFields = mun.data()?.community?.profileForm?.fields as { key: string }[];
    expect(savedFields.map((f) => f.key)).toEqual(['edad']);

    const censo = await admin.firestore().doc(`censoAnswers/${MID}_${MEMBER_ID}`).get();
    const answers = censo.data()?.profileAnswers as Record<string, unknown>;
    expect(answers.color).toBeUndefined();
    expect(answers.edad).toBe(30);
  });
});
