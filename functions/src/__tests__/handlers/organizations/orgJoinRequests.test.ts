// Handler tests for joining an `approval` org: the respondToOrgJoinRequest
// callable and the trigger that tells the org's admins a request arrived.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { respondToOrgJoinRequest } from '../../../organizations/respondToOrgJoinRequest';
import { onOrgJoinRequestCreated } from '../../../organizations/onOrgJoinRequestCreated';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const ORG_ID = 'org-1';
const MID = 'mun-1';
const ORG_ADMIN = 'founder';
const MEMBER = 'socio';
const VILLAGE_ADMIN = 'vadmin';
const REQUESTER = 'joiner';

const db = () => admin.firestore();

async function seed(): Promise<void> {
  await db().doc(`organizations/${ORG_ID}`).set({
    name: 'Peña El Trago',
    description: null,
    images: [],
    type: 'peña',
    status: 'approved',
    municipalityId: MID,
    villageSlug: 'villarriba',
    requestedBy: ORG_ADMIN,
    reviewedBy: 'someone',
    createdAt: new Date(),
    reviewedAt: new Date(),
    commentCount: 0,
    readCount: 0,
    memberCount: 0,
    membersPublic: true,
    joinPolicy: 'approval',
  });
  await db().doc(`organizations/${ORG_ID}/members/${ORG_ADMIN}`).set({
    userId: ORG_ADMIN, joinedAt: new Date(), role: 'admin',
  });
  await db().doc(`organizations/${ORG_ID}/members/${MEMBER}`).set({
    userId: MEMBER, joinedAt: new Date(), role: 'member',
  });
  await db().doc(`municipalities/${MID}/members/${VILLAGE_ADMIN}`).set({
    userId: VILLAGE_ADMIN, role: 'admin', joinedAt: new Date(), profileAnswers: {}, profileCompletedAt: null,
  });
  await db().doc(`organizations/${ORG_ID}/joinRequests/${REQUESTER}`).set({
    userId: REQUESTER, orgId: ORG_ID, municipalityId: MID, createdAt: new Date(),
  });
  await db().doc(`users/${REQUESTER}`).set({ displayName: 'Lucía Pérez' });
}

function respond(uid: string, data: unknown): Promise<unknown> {
  const wrapped = ft.wrap(respondToOrgJoinRequest as unknown as Parameters<typeof ft.wrap>[0]);
  return Promise.resolve(
    wrapped({ data, auth: { uid, token: {} } } as unknown as Parameters<typeof wrapped>[0]),
  );
}

const notificationsOf = async (uid: string) =>
  (await db().collection(`users/${uid}/notifications`).get()).docs.map((d) => d.data());

beforeEach(async () => {
  await resetEmulators();
  await seed();
});

afterAll(() => {
  ft.cleanup();
});

describe('respondToOrgJoinRequest', () => {
  it('an org admin approves: member added, request gone, audited, requester notified', async () => {
    await respond(ORG_ADMIN, { orgId: ORG_ID, userId: REQUESTER, decision: 'approved' });

    const memberSnap = await db().doc(`organizations/${ORG_ID}/members/${REQUESTER}`).get();
    expect(memberSnap.get('role')).toBe('member');
    expect((await db().doc(`organizations/${ORG_ID}/joinRequests/${REQUESTER}`).get()).exists).toBe(false);

    const events = (await db().collection('membershipEvents').get()).docs.map((d) => d.data());
    expect(events).toEqual([
      expect.objectContaining({
        scopeType: 'org', scopeId: ORG_ID, municipalityId: MID,
        actorUserId: ORG_ADMIN, targetUserId: REQUESTER, action: 'added', toRole: 'member',
      }),
    ]);
    expect(await notificationsOf(REQUESTER)).toEqual([
      expect.objectContaining({
        type: 'org_join_request_approved', entityKind: 'organization', entityId: ORG_ID,
      }),
    ]);
  });

  it('an org admin rejects: no member, request gone, requester notified', async () => {
    await respond(ORG_ADMIN, { orgId: ORG_ID, userId: REQUESTER, decision: 'rejected' });

    expect((await db().doc(`organizations/${ORG_ID}/members/${REQUESTER}`).get()).exists).toBe(false);
    expect((await db().doc(`organizations/${ORG_ID}/joinRequests/${REQUESTER}`).get()).exists).toBe(false);
    expect(await notificationsOf(REQUESTER)).toEqual([
      expect.objectContaining({ type: 'org_join_request_rejected' }),
    ]);
  });

  it("an admin of the org's village may resolve it too", async () => {
    await respond(VILLAGE_ADMIN, { orgId: ORG_ID, userId: REQUESTER, decision: 'approved' });
    expect((await db().doc(`organizations/${ORG_ID}/members/${REQUESTER}`).get()).exists).toBe(true);
  });

  it('a plain member may not resolve it', async () => {
    await expect(
      respond(MEMBER, { orgId: ORG_ID, userId: REQUESTER, decision: 'approved' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await db().doc(`organizations/${ORG_ID}/members/${REQUESTER}`).get()).exists).toBe(false);
  });

  it('a request that no longer exists is not-found (withdrawn or already resolved)', async () => {
    await db().doc(`organizations/${ORG_ID}/joinRequests/${REQUESTER}`).delete();
    await expect(
      respond(ORG_ADMIN, { orgId: ORG_ID, userId: REQUESTER, decision: 'approved' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects a malformed decision', async () => {
    await expect(
      respond(ORG_ADMIN, { orgId: ORG_ID, userId: REQUESTER, decision: 'maybe' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('onOrgJoinRequestCreated', () => {
  it("notifies the org's admins, and nobody else", async () => {
    const wrapped = ft.wrap(onOrgJoinRequestCreated);
    const snap = ft.firestore.makeDocumentSnapshot(
      { userId: REQUESTER, orgId: ORG_ID, municipalityId: MID, createdAt: new Date() },
      `organizations/${ORG_ID}/joinRequests/${REQUESTER}`,
    );
    await wrapped({ data: snap, params: { orgId: ORG_ID, userId: REQUESTER } } as unknown as Parameters<
      typeof wrapped
    >[0]);

    const toAdmin = await notificationsOf(ORG_ADMIN);
    expect(toAdmin).toEqual([
      expect.objectContaining({
        type: 'org_join_request_created',
        requesterUid: REQUESTER,
        entityKind: 'organization',
        entityId: ORG_ID,
        municipalityId: MID,
      }),
    ]);
    expect(toAdmin[0]?.body).toContain('Lucía Pérez');
    expect(await notificationsOf(MEMBER)).toEqual([]);
  });
});
