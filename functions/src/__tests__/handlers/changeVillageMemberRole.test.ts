// Handler test for the changeVillageMemberRole callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { changeVillageMemberRole } from '../../village/changeVillageMemberRole';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const VILLAGE_ADMIN_ID = 'admin-1';
const APP_ADMIN_ID = 'super-1';
const TARGET_ID = 'bob';
const OUTSIDER_ID = 'eve';

async function seedMunicipality(organizerId: string | null = null): Promise<void> {
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
      community: { organizerId, organizerSex: null, description: 'Mi pueblo', profileForm: null, activatedAt: now, fiestas: [] },
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

interface CallableResult {
  ok: true;
}

async function callChange(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = ft.wrap(changeVillageMemberRole as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

async function memberRole(uid: string): Promise<string | undefined> {
  const doc = await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}/members/${uid}`)
    .get();
  return doc.data()?.role;
}

async function membershipEvents(): Promise<admin.firestore.DocumentData[]> {
  const snap = await admin.firestore().collection('membershipEvents').get();
  return snap.docs.map((d) => d.data());
}

describe('changeVillageMemberRole (callable)', () => {
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
      callChange({ uid: null, data: { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID, role: 'admin' } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws invalid-argument on a bad role', async () => {
    await expect(
      callChange({ uid: VILLAGE_ADMIN_ID, data: { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID, role: 'boss' } }),
    ).rejects.toThrow(/inv/i);
  });

  it('a village admin promotes a member to admin and writes a role_changed event', async () => {
    await seedMunicipality();
    await seedMember(VILLAGE_ADMIN_ID, 'admin');
    await seedMember(TARGET_ID, 'user');

    const result = await callChange({
      uid: VILLAGE_ADMIN_ID,
      data: { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID, role: 'admin' },
    });
    expect(result.ok).toBe(true);
    expect(await memberRole(TARGET_ID)).toBe('admin');

    const events = await membershipEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scopeType: 'village',
      scopeId: MUNICIPALITY_ID,
      municipalityId: MUNICIPALITY_ID,
      actorUserId: VILLAGE_ADMIN_ID,
      targetUserId: TARGET_ID,
      action: 'role_changed',
      fromRole: 'user',
      toRole: 'admin',
    });
  });

  it('an app admin can demote a plain admin to user', async () => {
    await seedMunicipality();
    await seedAppAdmin(APP_ADMIN_ID);
    await seedMember(TARGET_ID, 'admin');

    await callChange({
      uid: APP_ADMIN_ID,
      data: { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID, role: 'user' },
    });
    expect(await memberRole(TARGET_ID)).toBe('user');
  });

  it('throws permission-denied when the caller is not an admin', async () => {
    await seedMunicipality();
    await seedMember(OUTSIDER_ID, 'user');
    await seedMember(TARGET_ID, 'user');
    await expect(
      callChange({ uid: OUTSIDER_ID, data: { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID, role: 'admin' } }),
    ).rejects.toThrow(/no autorizado|permission-denied/i);
  });

  it('throws not-found when the target is not a member', async () => {
    await seedMunicipality();
    await seedMember(VILLAGE_ADMIN_ID, 'admin');
    await expect(
      callChange({ uid: VILLAGE_ADMIN_ID, data: { municipalityId: MUNICIPALITY_ID, targetUserId: 'ghost', role: 'admin' } }),
    ).rejects.toThrow(/no es miembro|not.?found/i);
  });

  it('refuses to demote the organizer (must transfer first)', async () => {
    await seedMunicipality(TARGET_ID); // TARGET is the organizer
    await seedMember(VILLAGE_ADMIN_ID, 'admin');
    await seedMember(TARGET_ID, 'admin');
    await expect(
      callChange({ uid: VILLAGE_ADMIN_ID, data: { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID, role: 'user' } }),
    ).rejects.toThrow(/embajador|failed-precondition/i);
    expect(await memberRole(TARGET_ID)).toBe('admin');
  });

  it('is a no-op (no event) when the role is unchanged', async () => {
    await seedMunicipality();
    await seedMember(VILLAGE_ADMIN_ID, 'admin');
    await seedMember(TARGET_ID, 'user');
    await callChange({
      uid: VILLAGE_ADMIN_ID,
      data: { municipalityId: MUNICIPALITY_ID, targetUserId: TARGET_ID, role: 'user' },
    });
    expect(await membershipEvents()).toHaveLength(0);
  });
});
