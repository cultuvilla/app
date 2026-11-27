// Trigger test for onOrganizationUpdated. Drives the handler via
// firebase-functions-test's wrap()/makeChange() against the Firestore
// emulator (admin SDK env is wired up in setup/admin.setup.ts).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { onOrganizationUpdated } from '../../organizations/notificationTriggers';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(onOrganizationUpdated);

const ORG_ID = 'org-test';
const MUNICIPALITY_ID = 'mun-test';
const REQUESTED_BY = 'requester-1';

interface OrgShape {
  name: string;
  municipalityId: string;
  status: string;
  requestedBy?: string;
}

function org(overrides: Partial<OrgShape> = {}): Record<string, unknown> {
  const merged: OrgShape = {
    name: 'Peña El Recreo',
    municipalityId: MUNICIPALITY_ID,
    status: 'pending',
    requestedBy: REQUESTED_BY,
    ...overrides,
  };
  // The emulator cannot encode an explicit `undefined` field value
  // (makeDocumentSnapshot rejects it), so a `requestedBy: undefined` override
  // must drop the key entirely to model a doc that never had the field.
  return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
}

async function fireTrigger(before: Record<string, unknown>, after: Record<string, unknown>): Promise<void> {
  const beforeSnap = ft.firestore.makeDocumentSnapshot(
    before,
    `organizations/${ORG_ID}`,
  );
  const afterSnap = ft.firestore.makeDocumentSnapshot(
    after,
    `organizations/${ORG_ID}`,
  );
  const change = ft.makeChange(beforeSnap, afterSnap);
  await wrapped({
    data: change,
    params: { orgId: ORG_ID },
  });
}

async function notificationsFor(uid: string): Promise<admin.firestore.QuerySnapshot> {
  return admin.firestore().collection(`users/${uid}/notifications`).get();
}

beforeAll(async () => {
  await resetEmulators();
});

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('onOrganizationUpdated', () => {
  it('writes an org_approved notification on pending -> approved', async () => {
    await fireTrigger(org({ status: 'pending' }), org({ status: 'approved' }));

    const notifs = await notificationsFor(REQUESTED_BY);
    expect(notifs.size).toBe(1);
    const data = notifs.docs[0].data();
    expect(data['type']).toBe('org_approved');
    // User-facing copy says «grupo», never «organización».
    expect(data['title']).toBe('Grupo aprobado');
    expect(data['body']).toContain('Tu grupo');
    expect(data['municipalityId']).toBe(MUNICIPALITY_ID);
    // So tapping it opens the group (QA 2026-11-18: it opened the create form).
    expect(data['entityKind']).toBe('organization');
    expect(data['entityId']).toBe(ORG_ID);
  });

  it('writes an org_rejected notification on pending -> rejected', async () => {
    await fireTrigger(org({ status: 'pending' }), org({ status: 'rejected' }));

    const notifs = await notificationsFor(REQUESTED_BY);
    expect(notifs.size).toBe(1);
    expect(notifs.docs[0].data()['type']).toBe('org_rejected');
    expect(notifs.docs[0].data()['title']).toBe('Grupo rechazado');
    // A rejected group has no page to open; the route sends it to the village.
    expect(notifs.docs[0].data()['entityId']).toBeNull();
  });

  it('writes nothing for a non-pending-origin transition (approved -> approved)', async () => {
    await fireTrigger(org({ status: 'approved' }), org({ status: 'approved', name: 'Renamed' }));

    const notifs = await notificationsFor(REQUESTED_BY);
    expect(notifs.size).toBe(0);
  });

  it('writes nothing when requestedBy is missing', async () => {
    await fireTrigger(
      org({ status: 'pending', requestedBy: undefined }),
      org({ status: 'approved', requestedBy: undefined }),
    );

    // No requestedBy means no user to check — assert nothing was written for
    // the would-be requester, using the collection group as a proxy.
    const all = await admin.firestore().collectionGroup('notifications').get();
    expect(all.size).toBe(0);
  });

  it('writes nothing when status transitions to something other than approved/rejected', async () => {
    await fireTrigger(org({ status: 'pending' }), org({ status: 'pending', name: 'Renamed' }));

    const notifs = await notificationsFor(REQUESTED_BY);
    expect(notifs.size).toBe(0);
  });
});
