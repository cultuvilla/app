// Handler test for the approveOrganization callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { approveOrganization } from '../../organizations/approveOrganization';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const ORG_ID = 'org-1';
const MUNICIPALITY_ID = 'mun-1';
const REQUESTER_ID = 'creator';
const VILLAGE_ADMIN_ID = 'vadmin';
const APP_ADMIN_ID = 'super-1';
const OUTSIDER_ID = 'eve';

async function seedOrg(status: 'pending' | 'approved' = 'pending'): Promise<void> {
  await admin.firestore().doc(`organizations/${ORG_ID}`).set({
    name: 'Peña',
    description: null,
    images: [],
    type: 'peña',
    status,
    municipalityId: MUNICIPALITY_ID,
    requestedBy: REQUESTER_ID,
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

async function seedVillageAdmin(uid: string): Promise<void> {
  await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}/members/${uid}`).set({
    userId: uid,
    role: 'admin',
    joinedAt: new Date(),
    profileAnswers: {},
    profileCompletedAt: null,
    // Required-nullable in VillageMemberDataSchema; the callable reads this doc
    // through the converter, which throws if it's missing.
  });
}

async function seedAppAdmin(uid: string): Promise<void> {
  await admin.firestore().doc(`admins/${uid}`).set({ createdAt: new Date() });
}

interface CallableResult {
  ok: true;
}

async function callApprove(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = ft.wrap(approveOrganization as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('approveOrganization (callable)', () => {
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
    await expect(callApprove({ uid: null, data: { orgId: ORG_ID } })).rejects.toThrow(
      /unauthenticated|inici/i,
    );
  });

  it('a village admin approves: status flips, requester seeded as admin, added event written', async () => {
    await seedOrg('pending');
    await seedVillageAdmin(VILLAGE_ADMIN_ID);

    const result = await callApprove({ uid: VILLAGE_ADMIN_ID, data: { orgId: ORG_ID } });
    expect(result.ok).toBe(true);

    const orgDoc = await admin.firestore().doc(`organizations/${ORG_ID}`).get();
    expect(orgDoc.data()?.status).toBe('approved');
    // Installed binaries still create orgs as `open`.
    expect(orgDoc.data()?.joinPolicy).toBe('approval');
    expect(orgDoc.data()?.reviewedBy).toBe(VILLAGE_ADMIN_ID);

    const memberDoc = await admin
      .firestore()
      .doc(`organizations/${ORG_ID}/members/${REQUESTER_ID}`)
      .get();
    expect(memberDoc.exists).toBe(true);
    expect(memberDoc.data()?.role).toBe('admin');

    const events = await admin.firestore().collection('membershipEvents').get();
    expect(events.size).toBe(1);
    expect(events.docs[0].data()).toMatchObject({
      scopeType: 'org',
      scopeId: ORG_ID,
      municipalityId: MUNICIPALITY_ID,
      actorUserId: VILLAGE_ADMIN_ID,
      targetUserId: REQUESTER_ID,
      action: 'added',
      toRole: 'admin',
    });
  });

  it('an app admin can approve', async () => {
    await seedOrg('pending');
    await seedAppAdmin(APP_ADMIN_ID);
    await callApprove({ uid: APP_ADMIN_ID, data: { orgId: ORG_ID } });
    const orgDoc = await admin.firestore().doc(`organizations/${ORG_ID}`).get();
    expect(orgDoc.data()?.status).toBe('approved');
  });

  it('throws permission-denied when the caller is neither a village admin nor app admin', async () => {
    await seedOrg('pending');
    await expect(callApprove({ uid: OUTSIDER_ID, data: { orgId: ORG_ID } })).rejects.toThrow(
      /no autorizado|permission-denied/i,
    );
  });

  it('throws failed-precondition when the org is already reviewed', async () => {
    await seedOrg('approved');
    await seedVillageAdmin(VILLAGE_ADMIN_ID);
    await expect(callApprove({ uid: VILLAGE_ADMIN_ID, data: { orgId: ORG_ID } })).rejects.toThrow(
      /ya fue revisada|failed-precondition/i,
    );
  });

  it('throws not-found when the org does not exist', async () => {
    await seedAppAdmin(APP_ADMIN_ID);
    await expect(callApprove({ uid: APP_ADMIN_ID, data: { orgId: 'ghost' } })).rejects.toThrow(
      /no encontrada|not.?found/i,
    );
  });
});
