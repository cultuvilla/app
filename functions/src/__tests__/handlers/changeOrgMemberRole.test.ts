// Handler test for the changeOrgMemberRole callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { changeOrgMemberRole } from '../../organizations/changeOrgMemberRole';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const ORG_ID = 'org-1';
const MUNICIPALITY_ID = 'mun-1';
const ORG_ADMIN_ID = 'creator';
const APP_ADMIN_ID = 'super-1';
const TARGET_ID = 'bob';
const OUTSIDER_ID = 'eve';

async function seedOrg(): Promise<void> {
  await admin.firestore().doc(`organizations/${ORG_ID}`).set({
    name: 'Peña',
    description: null,
    images: [],
    type: 'peña',
    status: 'approved',
    municipalityId: MUNICIPALITY_ID,
    requestedBy: ORG_ADMIN_ID,
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

async function seedAppAdmin(uid: string): Promise<void> {
  await admin.firestore().doc(`admins/${uid}`).set({ createdAt: new Date() });
}

interface CallableResult {
  ok: true;
}

async function callChange(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = ft.wrap(changeOrgMemberRole as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

async function orgMemberRole(uid: string): Promise<string | undefined> {
  const doc = await admin.firestore().doc(`organizations/${ORG_ID}/members/${uid}`).get();
  return doc.data()?.role;
}

async function membershipEvents(): Promise<admin.firestore.DocumentData[]> {
  const snap = await admin.firestore().collection('membershipEvents').get();
  return snap.docs.map((d) => d.data());
}

describe('changeOrgMemberRole (callable)', () => {
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
      callChange({ uid: null, data: { orgId: ORG_ID, targetUserId: TARGET_ID, role: 'admin' } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('an org admin promotes a member to admin and writes an org role_changed event', async () => {
    await seedOrg();
    await seedOrgMember(ORG_ADMIN_ID, 'admin');
    await seedOrgMember(TARGET_ID, 'member');

    const result = await callChange({
      uid: ORG_ADMIN_ID,
      data: { orgId: ORG_ID, targetUserId: TARGET_ID, role: 'admin' },
    });
    expect(result.ok).toBe(true);
    expect(await orgMemberRole(TARGET_ID)).toBe('admin');

    const events = await membershipEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scopeType: 'org',
      scopeId: ORG_ID,
      municipalityId: MUNICIPALITY_ID,
      actorUserId: ORG_ADMIN_ID,
      targetUserId: TARGET_ID,
      action: 'role_changed',
      fromRole: 'member',
      toRole: 'admin',
    });
  });

  it('an app admin can demote an org admin to member', async () => {
    await seedOrg();
    await seedAppAdmin(APP_ADMIN_ID);
    await seedOrgMember(TARGET_ID, 'admin');
    await callChange({
      uid: APP_ADMIN_ID,
      data: { orgId: ORG_ID, targetUserId: TARGET_ID, role: 'member' },
    });
    expect(await orgMemberRole(TARGET_ID)).toBe('member');
  });

  it('throws permission-denied when the caller is not an org admin', async () => {
    await seedOrg();
    await seedOrgMember(OUTSIDER_ID, 'member');
    await seedOrgMember(TARGET_ID, 'member');
    await expect(
      callChange({ uid: OUTSIDER_ID, data: { orgId: ORG_ID, targetUserId: TARGET_ID, role: 'admin' } }),
    ).rejects.toThrow(/no autorizado|permission-denied/i);
  });

  it('throws not-found when the target is not a member', async () => {
    await seedOrg();
    await seedOrgMember(ORG_ADMIN_ID, 'admin');
    await expect(
      callChange({ uid: ORG_ADMIN_ID, data: { orgId: ORG_ID, targetUserId: 'ghost', role: 'admin' } }),
    ).rejects.toThrow(/no es integrante|not.?found/i);
  });
});
