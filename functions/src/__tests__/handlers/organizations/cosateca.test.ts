// Handler tests for the cosateca — the respondToCosaRequest callable, the
// notifications onCosaRequestWritten writes, and the audience sync folded into
// onOrganizationUpdated — against the Firestore emulator.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { respondToCosaRequest } from '../../../organizations/respondToCosaRequest';
import { cosaNoticeFor, notifyCosaRequest } from '../../../organizations/onCosaRequestWritten';
import { syncCosaAudience } from '../../../organizations/syncCosaAudience';
import { buildCosaRequestData, buildOrganizationData, type CosaRequestData } from '@cultuvilla/shared/models';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG = 'ayto';
const db = () => admin.firestore();

function cosa(overrides: Record<string, unknown> = {}) {
  return {
    municipalityId: 'mun-1', orgId: ORG, audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', kind: 'prestamo',
    title: 'Carpa', description: null, category: 'fiestas', imageURL: null, conditions: null, status: 'available', heldBy: null,
    createdBy: 'u-admin', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...overrides,
  };
}

function req(overrides: Partial<CosaRequestData> = {}): CosaRequestData {
  return {
    ...buildCosaRequestData({
      municipalityId: 'mun-1', orgId: ORG, cosaId: 'carpa', cosaTitle: 'Carpa', cosaKind: 'prestamo', ownerUid: null,
      requesterUid: 'u-ana', requesterName: 'Ana', createdAt: new Date('2026-06-01'),
    }),
    ...overrides,
  };
}

async function seedRequest(id: string, overrides: Partial<CosaRequestData> = {}) {
  await db().doc(`cosaRequests/${id}`).set(req(overrides));
}
const getDoc = async (path: string) => (await db().doc(path).get()).data() as Record<string, unknown>;

function call(uid: string | null, data: unknown) {
  const wrapped = ft.wrap(respondToCosaRequest as unknown as Parameters<typeof ft.wrap>[0]);
  return wrapped({ data, auth: uid ? { uid, token: {} } : undefined } as unknown as Parameters<typeof wrapped>[0]) as Promise<{ status: string }>;
}

beforeEach(async () => {
  await resetEmulators();
  await db().doc(`organizations/${ORG}`).set(
    buildOrganizationData({
      name: 'Ayuntamiento de Villa', type: 'ayuntamiento', status: 'approved', municipalityId: 'mun-1', villageSlug: 'villa',
      requestedBy: 'u-admin', cosateca: { enabled: true, audience: 'pueblo' },
    }),
  );
  for (const [uid, role] of [['u-admin', 'admin'], ['u-admin2', 'admin'], ['u-luis', 'member']] as const) {
    await db().doc(`organizations/${ORG}/members/${uid}`).set({ userId: uid, joinedAt: new Date('2025-01-01'), role });
  }
  await db().doc('cosas/carpa').set(cosa());
});

afterAll(() => {
  ft.cleanup();
});

describe('respondToCosaRequest', () => {
  it('walks a loan: accept, lend (the cosa is held), return (it is free again)', async () => {
    await seedRequest('r1', { fromOn: '2026-07-01', untilOn: '2026-07-03' });
    await expect(call('u-admin', { requestId: 'r1', action: 'accept' })).resolves.toEqual({ status: 'accepted' });
    expect(await getDoc('cosaRequests/r1')).toMatchObject({ status: 'accepted', closedAt: null });
    expect((await getDoc('cosaRequests/r1'))['respondedAt']).toBeTruthy();

    await call('u-admin', { requestId: 'r1', action: 'lend' });
    expect((await getDoc('cosas/carpa'))['heldBy']).toEqual({ requestId: 'r1', uid: 'u-ana', name: 'Ana', untilOn: '2026-07-03' });

    await call('u-admin2', { requestId: 'r1', action: 'return' });
    expect(await getDoc('cosaRequests/r1')).toMatchObject({ status: 'returned' });
    expect((await getDoc('cosaRequests/r1'))['closedAt']).toBeTruthy();
    expect((await getDoc('cosas/carpa'))['heldBy']).toBeNull();
  });

  it('refuses accepting a loan that overlaps one already accepted, but not one on other days', async () => {
    await seedRequest('r1', { status: 'accepted', fromOn: '2026-07-01', untilOn: '2026-07-03' });
    await seedRequest('r2', { requesterUid: 'u-luis', requesterName: 'Luis', fromOn: '2026-07-03', untilOn: '2026-07-05' });
    await seedRequest('r3', { requesterUid: 'u-luis', requesterName: 'Luis', fromOn: '2026-07-10', untilOn: '2026-07-12' });
    await expect(call('u-admin', { requestId: 'r2', action: 'accept' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call('u-admin', { requestId: 'r3', action: 'accept' })).resolves.toEqual({ status: 'accepted' });
  });

  it('refuses lending what someone else holds', async () => {
    await db().doc('cosas/carpa').update({ heldBy: { requestId: 'r0', uid: 'u-luis', name: 'Luis', untilOn: null } });
    await seedRequest('r1', { status: 'accepted' });
    await expect(call('u-admin', { requestId: 'r1', action: 'lend' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('keeps each move to its side', async () => {
    await seedRequest('r1');
    await expect(call('u-ana', { requestId: 'r1', action: 'accept' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('u-luis', { requestId: 'r1', action: 'accept' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('u-admin', { requestId: 'r1', action: 'cancel' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('u-ana', { requestId: 'r1', action: 'cancel' })).resolves.toEqual({ status: 'cancelled' });
    await expect(call('u-ana', { requestId: 'r1', action: 'cancel' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('a personal cosa is answered by its owner, and by the group’s admins as the backstop', async () => {
    await db().doc('cosas/taladro').set(cosa({ ownerUid: 'u-luis', ownerName: 'Luis', title: 'Taladro', audience: 'integrantes' }));
    await seedRequest('r1', { cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'u-luis' });
    await seedRequest('r2', { cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'u-luis', fromOn: '2027-01-01', untilOn: '2027-01-02' });
    await expect(call('u-luis', { requestId: 'r1', action: 'decline' })).resolves.toEqual({ status: 'declined' });
    await expect(call('u-admin', { requestId: 'r2', action: 'accept' })).resolves.toEqual({ status: 'accepted' });
  });

  it('giving a regalo closes the cosa and declines its other open requests', async () => {
    await db().doc('cosas/carpa').update({ kind: 'regalo' });
    await seedRequest('r1', { cosaKind: 'regalo', status: 'accepted' });
    await seedRequest('r2', { cosaKind: 'regalo', requesterUid: 'u-luis', requesterName: 'Luis' });
    await expect(call('u-admin', { requestId: 'r1', action: 'give' })).resolves.toEqual({ status: 'given' });
    expect((await getDoc('cosas/carpa'))['status']).toBe('given');
    expect(await getDoc('cosaRequests/r2')).toMatchObject({ status: 'declined' });
  });

  it('a deleted cosa can still be declined, never handed over', async () => {
    await seedRequest('r1');
    await db().doc('cosas/carpa').delete();
    await expect(call('u-admin', { requestId: 'r1', action: 'accept' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call('u-admin', { requestId: 'r1', action: 'decline' })).resolves.toEqual({ status: 'declined' });
  });

  it('rejects the unauthenticated and bad arguments', async () => {
    await expect(call(null, { requestId: 'r1', action: 'accept' })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call('u-admin', { requestId: 'r1', action: 'steal' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call('u-admin', { requestId: 'missing', action: 'accept' })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('onCosaRequestWritten', () => {
  it('tells the managers of a new request: the group’s admins for a group cosa, the owner for a personal one', async () => {
    const created = req();
    expect(cosaNoticeFor(null, created)).toBe('created');
    await notifyCosaRequest(db(), 'r1', null, created, new Date());
    for (const uid of ['u-admin', 'u-admin2']) {
      const n = await getDoc(`users/${uid}/notifications/cosa_r1_created`);
      expect(n).toMatchObject({ type: 'group_task', entityKind: 'organization', entityId: ORG, cosaRequestId: 'r1' });
      expect(n['body']).toContain('Ana pide «Carpa»');
    }
    await notifyCosaRequest(db(), 'r2', null, req({ ownerUid: 'u-luis' }), new Date());
    expect((await getDoc('users/u-luis/notifications/cosa_r2_created'))['body']).toContain('Ana te pide «Carpa»');
    expect((await db().doc('users/u-admin/notifications/cosa_r2_created').get()).exists).toBe(false);
  });

  it('tells the requester the answer, and the managers a cancellation; nothing for other moves', async () => {
    const pending = req();
    await notifyCosaRequest(db(), 'r1', pending, { ...pending, status: 'accepted' }, new Date());
    expect((await getDoc('users/u-ana/notifications/cosa_r1_accepted'))['title']).toContain('aceptada');
    await notifyCosaRequest(db(), 'r1', pending, { ...pending, status: 'cancelled' }, new Date());
    expect((await db().doc('users/u-admin/notifications/cosa_r1_cancelled').get()).exists).toBe(true);
    expect(cosaNoticeFor({ ...pending, status: 'accepted' }, { ...pending, status: 'lent' })).toBeNull();
    expect(cosaNoticeFor(pending, null)).toBeNull();
    expect(cosaNoticeFor(pending, pending)).toBeNull();
  });

  it('never tells an admin of their own request for the group’s cosa', async () => {
    await notifyCosaRequest(db(), 'r3', null, req({ requesterUid: 'u-admin', requesterName: 'Alcalde' }), new Date());
    expect((await db().doc('users/u-admin/notifications/cosa_r3_created').get()).exists).toBe(false);
    expect((await db().doc('users/u-admin2/notifications/cosa_r3_created').get()).exists).toBe(true);
  });
});

describe('syncCosaAudience', () => {
  it('rewrites the group’s cosas when its cosateca closes to the pueblo or switches off', async () => {
    await db().doc('cosas/otra').set(cosa({ title: 'Mesas' }));
    await db().doc('cosas/ajena').set(cosa({ orgId: 'other', title: 'Ajena' }));
    const open = { cosateca: { enabled: true, audience: 'pueblo' } };
    expect(await syncCosaAudience(db(), ORG, open, { cosateca: { enabled: true, audience: 'integrantes' } })).toBe(2);
    expect((await getDoc('cosas/carpa'))['audience']).toBe('integrantes');
    expect((await getDoc('cosas/ajena'))['audience']).toBe('pueblo');
    expect(await syncCosaAudience(db(), ORG, { cosateca: { enabled: true, audience: 'integrantes' } }, { cosateca: { enabled: false, audience: 'pueblo' } })).toBe(0);
    expect(await syncCosaAudience(db(), ORG, { cosateca: { enabled: false, audience: 'pueblo' } }, open)).toBe(2);
    expect((await getDoc('cosas/carpa'))['audience']).toBe('pueblo');
  });
});
