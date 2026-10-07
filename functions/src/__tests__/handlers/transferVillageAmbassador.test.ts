// Handler test for the transferVillageAmbassador callable — handing the one
// Embajador title of a pueblo to another member.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { buildPersonData, type Sex } from '@cultuvilla/shared/models';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { transferVillageAmbassador } from '../../village/transferVillageAmbassador';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const AMBASSADOR_ID = 'amb-1';
const TEAM_ID = 'team-1';
const TARGET_ID = 'maria';
const APP_ADMIN_ID = 'super-1';

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
      searchPrefixes: ['v'],
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
      community: {
        organizerId,
        organizerSex: organizerId ? 'male' : null,
        description: 'Mi pueblo',
        profileForm: null,
        activatedAt: now,
        fiestas: [],
      },
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

async function seedPerson(uid: string, sex: Sex | null): Promise<void> {
  await admin
    .firestore()
    .doc(`persons/p-${uid}`)
    .set(buildPersonData({ givenName: uid, userId: uid, createdBy: uid, sex }));
}

async function call(uid: string | null, data: unknown): Promise<{ ok: true }> {
  const wrapped = ft.wrap(transferVillageAmbassador as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data,
    auth: uid ? { uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as { ok: true };
}

async function community(): Promise<admin.firestore.DocumentData | undefined> {
  const snap = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
  return snap.data()?.community;
}

async function roleOf(uid: string): Promise<string | undefined> {
  const snap = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}/members/${uid}`).get();
  return snap.data()?.role;
}

async function events(): Promise<admin.firestore.DocumentData[]> {
  const snap = await admin.firestore().collection('membershipEvents').get();
  return snap.docs.map((d) => d.data());
}

describe('transferVillageAmbassador (callable)', () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(
      call(null, { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('the Embajador hands the title to a plain member, who becomes admin', async () => {
    await seedMunicipality(AMBASSADOR_ID);
    await seedMember(AMBASSADOR_ID, 'admin');
    await seedMember(TARGET_ID, 'user');
    await seedPerson(TARGET_ID, 'female');

    await call(AMBASSADOR_ID, { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID });

    const c = await community();
    expect(c?.organizerId).toBe(TARGET_ID);
    expect(c?.organizerSex).toBe('female');
    expect(await roleOf(TARGET_ID)).toBe('admin');
    // The outgoing Embajador stays on the team.
    expect(await roleOf(AMBASSADOR_ID)).toBe('admin');

    const actions = (await events()).map((e) => e.action).sort();
    expect(actions).toEqual(['organizer_set', 'role_changed']);
  });

  it('a target with no person doc gets a null organizerSex', async () => {
    await seedMunicipality(AMBASSADOR_ID);
    await seedMember(AMBASSADOR_ID, 'admin');
    await seedMember(TEAM_ID, 'admin');

    await call(AMBASSADOR_ID, { municipalityId: MUNICIPALITY_ID, targetUserId: TEAM_ID });

    const c = await community();
    expect(c?.organizerId).toBe(TEAM_ID);
    expect(c?.organizerSex).toBeNull();
    // Already admin: only the title moves.
    expect((await events()).map((e) => e.action)).toEqual(['organizer_set']);
  });

  it('a team admin who is not the Embajador cannot take or give the title', async () => {
    await seedMunicipality(AMBASSADOR_ID);
    await seedMember(AMBASSADOR_ID, 'admin');
    await seedMember(TEAM_ID, 'admin');

    await expect(
      call(TEAM_ID, { municipalityId: MUNICIPALITY_ID, targetUserId: TEAM_ID }),
    ).rejects.toThrow(/autoriz|permission/i);
    expect((await community())?.organizerId).toBe(AMBASSADOR_ID);
  });

  it('an app admin can appoint an Embajador even when the pueblo has none', async () => {
    await seedMunicipality(null);
    await admin.firestore().doc(`admins/${APP_ADMIN_ID}`).set({ createdAt: new Date() });
    await seedMember(TARGET_ID, 'user');
    await seedPerson(TARGET_ID, 'male');

    await call(APP_ADMIN_ID, { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID });

    const c = await community();
    expect(c?.organizerId).toBe(TARGET_ID);
    expect(c?.organizerSex).toBe('male');
  });

  it('refuses a target who is not a member of the pueblo', async () => {
    await seedMunicipality(AMBASSADOR_ID);
    await seedMember(AMBASSADOR_ID, 'admin');

    await expect(
      call(AMBASSADOR_ID, { municipalityId: MUNICIPALITY_ID, targetUserId: 'stranger' }),
    ).rejects.toThrow(/miembro|not-found/i);
  });
});
