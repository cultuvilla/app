// A failing cosa-audience sync must not cost the founder their org_approved
// notification: onOrganizationUpdated runs both, and the sync is the extra.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { onOrganizationUpdated } from '../../organizations/notificationTriggers';

vi.mock('../../organizations/syncCosaAudience', () => ({
  syncCosaAudience: vi.fn(() => Promise.reject(new Error('boom'))),
}));

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(onOrganizationUpdated);

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('onOrganizationUpdated when the cosa audience sync fails', () => {
  it('still tells the founder their group was approved', async () => {
    const base = { name: 'Peña', municipalityId: 'mun-x', requestedBy: 'founder', cosateca: { enabled: false, audience: 'integrantes' } };
    const before = ft.firestore.makeDocumentSnapshot({ ...base, status: 'pending' }, 'organizations/org-x');
    const after = ft.firestore.makeDocumentSnapshot(
      { ...base, status: 'approved', cosateca: { enabled: true, audience: 'pueblo' } },
      'organizations/org-x',
    );
    await wrapped({ data: ft.makeChange(before, after), params: { orgId: 'org-x' } } as unknown as Parameters<typeof wrapped>[0]);
    const notes = await admin.firestore().collection('users/founder/notifications').get();
    expect(notes.docs.map((d) => d.data()['type'])).toContain('org_approved');
  });
});
