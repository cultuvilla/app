// Deleting a group cascades what it owns. A client may delete the group doc
// (village/app admins, firestore.rules) but not its integrantes, socios or the
// audit log, so the cascade runs in onOrganizationUpdated's delete branch.
// Driven through firebase-functions-test's wrap() against the Firestore emulator.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { onOrganizationUpdated } from '../../organizations/notificationTriggers';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(onOrganizationUpdated);

const ORG_ID = 'org-gone';
const OTHER_ORG_ID = 'org-kept';
const MUNICIPALITY_ID = 'mun-test';
const DELETER = 'village-admin-1';

const ORG = { name: 'Peña El Recreo', municipalityId: MUNICIPALITY_ID, status: 'approved', requestedBy: 'founder-1' };

async function fireDelete(authId: string | undefined): Promise<void> {
  const before = ft.firestore.makeDocumentSnapshot(ORG, `organizations/${ORG_ID}`);
  const after = ft.firestore.makeDocumentSnapshot({}, `organizations/${ORG_ID}`);
  await wrapped({
    data: ft.makeChange(before, after),
    params: { orgId: ORG_ID },
    // 'app_user' is what Eventarc sends for a signed-in client; the SDK's AuthType union omits it.
    ...(authId ? { authType: 'app_user', authId } : { authType: 'unknown' }),
  });
}

async function seedSubtree(orgId: string): Promise<void> {
  const db = admin.firestore();
  const org = db.collection('organizations').doc(orgId);
  await org.collection('members').doc('founder-1').set({ userId: 'founder-1', role: 'admin' });
  await org.collection('members').doc('member-2').set({ userId: 'member-2', role: 'member' });
  await org.collection('joinRequests').doc('applicant-3').set({ userId: 'applicant-3' });
  await org.collection('socios').doc('socio-1').set({ name: 'x' });
  await org.collection('tasks').doc('task-1').collection('chat').doc('c1').set({ text: 'hola' });
}

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('onOrganizationUpdated — the group was deleted', () => {
  it('deletes everything under the group and nothing under another', async () => {
    await seedSubtree(ORG_ID);
    await seedSubtree(OTHER_ORG_ID);
    await admin.firestore().collection('organizations').doc(OTHER_ORG_ID).set(ORG);

    await fireDelete(DELETER);

    const db = admin.firestore();
    const gone = db.collection('organizations').doc(ORG_ID);
    for (const sub of ['members', 'joinRequests', 'socios', 'tasks']) {
      expect((await gone.collection(sub).get()).size, sub).toBe(0);
    }
    expect((await gone.collection('tasks').doc('task-1').collection('chat').get()).size).toBe(0);

    const kept = db.collection('organizations').doc(OTHER_ORG_ID);
    expect((await kept.collection('members').get()).size).toBe(2);
    expect((await kept.collection('tasks').doc('task-1').collection('chat').get()).size).toBe(1);
  });

  it('records a `removed` membership event per integrante, by who deleted the group', async () => {
    await seedSubtree(ORG_ID);

    await fireDelete(DELETER);

    const events = await admin.firestore().collection('membershipEvents').get();
    const rows = events.docs.map((d) => d.data()).sort((a, b) => String(a['targetUserId']).localeCompare(String(b['targetUserId'])));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r['targetUserId'], r['fromRole']])).toEqual([
      ['founder-1', 'admin'],
      ['member-2', 'member'],
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({
        scopeType: 'org',
        scopeId: ORG_ID,
        municipalityId: MUNICIPALITY_ID,
        actorUserId: DELETER,
        action: 'removed',
        toRole: null,
      });
    }
  });

  it('records an empty actor when no user deleted it (Admin SDK, console)', async () => {
    await seedSubtree(ORG_ID);

    await fireDelete(undefined);

    const events = await admin.firestore().collection('membershipEvents').get();
    expect(events.size).toBe(2);
    expect(events.docs.every((d) => d.data()['actorUserId'] === '')).toBe(true);
  });

  it('sends no approval/rejection notification', async () => {
    await fireDelete(DELETER);

    expect((await admin.firestore().collectionGroup('notifications').get()).size).toBe(0);
  });
});
