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
import { closeDeletedCosaRequests } from '../../../organizations/closeDeletedCosaRequests';
import { cleanupRemovedCosaImages } from '../../../images/cleanupRemovedImages';
import { buildCosaRequestData, buildOrganizationData, type CosaRequestData } from '@cultuvilla/shared/models';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG = 'ayto';
const db = () => admin.firestore();

function cosa(overrides: Record<string, unknown> = {}) {
  return {
    municipalityId: 'mun-1', orgId: ORG, audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', kind: 'prestamo', mode: 'prestamo',
    title: 'Carpa', description: null, category: 'fiestas', imageURL: null, conditions: null, location: null, locationNote: null,
    status: 'available', heldBy: null,
    reserva: null, createdBy: 'u-admin', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...overrides,
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
    expect((await getDoc('cosas/carpa'))['heldBy']).toMatchObject({ requestId: 'r1', uid: 'u-ana', name: 'Ana', untilOn: '2026-07-03' });
    expect((await getDoc('cosas/carpa'))['heldBy']).toHaveProperty('since');

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
    await db().doc('cosas/carpa').update({ heldBy: { requestId: 'r0', uid: 'u-luis', name: 'Luis', untilOn: null, since: new Date() } });
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

  it('an admin who asks for a cosa never answers their own request', async () => {
    await db().doc('cosas/taladro').set(cosa({ ownerUid: 'u-luis', ownerName: 'Luis', title: 'Taladro', audience: 'integrantes' }));
    await seedRequest('r1', { cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'u-luis', requesterUid: 'u-admin', requesterName: 'Admin' });
    await seedRequest('r2', { requesterUid: 'u-admin', requesterName: 'Admin' });
    await expect(call('u-admin', { requestId: 'r1', action: 'accept' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('u-admin', { requestId: 'r2', action: 'accept' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('u-admin', { requestId: 'r1', action: 'cancel' })).resolves.toEqual({ status: 'cancelled' });
    await expect(call('u-admin2', { requestId: 'r2', action: 'accept' })).resolves.toEqual({ status: 'accepted' });
  });

  it('giving a regalo never touches a request that is out on loan', async () => {
    await db().doc('cosas/carpa').update({ kind: 'regalo' });
    await seedRequest('r0', { requesterUid: 'u-luis', requesterName: 'Luis', status: 'lent' });
    await seedRequest('r1', { cosaKind: 'regalo', status: 'accepted' });
    await call('u-admin', { requestId: 'r1', action: 'give' });
    expect(await getDoc('cosaRequests/r0')).toMatchObject({ status: 'lent', closedAt: null });
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

describe('respondToCosaRequest: a colectivizado cosa', () => {
  // The village drill: colectivizado, held by Luis since October.
  const since = new Date('2026-10-03T10:00:00Z');
  beforeEach(async () => {
    await db().doc('cosas/carpa').update({
      mode: 'colectivizado',
      heldBy: { requestId: 'h1', uid: 'u-luis', name: 'Luis', untilOn: null, since },
    });
    await seedRequest('h1', { cosaMode: 'colectivizado', requesterUid: 'u-luis', requesterName: 'Luis', status: 'lent' });
  });

  it('its holder answers and hands it over: the requester holds it, the last holder’s request is passed', async () => {
    await seedRequest('r1', { cosaMode: 'colectivizado', holderUid: 'u-luis' });
    await seedRequest('r2', { cosaMode: 'colectivizado', holderUid: 'u-luis', requesterUid: 'u-pepa', requesterName: 'Pepa' });
    await expect(call('u-luis', { requestId: 'r1', action: 'accept' })).resolves.toEqual({ status: 'accepted' });
    await expect(call('u-luis', { requestId: 'r1', action: 'lend' })).resolves.toEqual({ status: 'lent' });

    const held = (await getDoc('cosas/carpa'))['heldBy'] as Record<string, unknown>;
    expect(held).toMatchObject({ requestId: 'r1', uid: 'u-ana', name: 'Ana', untilOn: null });
    expect((held['since'] as { toDate(): Date }).toDate().getTime()).toBeGreaterThan(since.getTime());
    expect(await getDoc('cosaRequests/h1')).toMatchObject({ status: 'passed' });
    expect((await getDoc('cosaRequests/h1'))['closedAt']).toBeTruthy();
    // Pepa's request now goes to Ana, who has it.
    expect(await getDoc('cosaRequests/r2')).toMatchObject({ status: 'pending', holderUid: 'u-ana' });
    // Ana answers it now; Luis, who handed it on, no longer does.
    await expect(call('u-luis', { requestId: 'r2', action: 'accept' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('u-ana', { requestId: 'r2', action: 'accept' })).resolves.toEqual({ status: 'accepted' });
  });

  it('is never returned, and the owner does not answer it while someone holds it', async () => {
    await expect(call('u-admin', { requestId: 'h1', action: 'return' })).rejects.toMatchObject({ code: 'permission-denied' });
    await db().doc('cosas/carpa').update({ ownerUid: 'u-owner', ownerName: 'Olga' });
    await seedRequest('r1', { cosaMode: 'colectivizado', ownerUid: 'u-owner', holderUid: 'u-luis' });
    await expect(call('u-owner', { requestId: 'r1', action: 'accept' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('takes one accepted request at a time: the next in line', async () => {
    await seedRequest('r1', { cosaMode: 'colectivizado', holderUid: 'u-luis', status: 'accepted' });
    await seedRequest('r2', { cosaMode: 'colectivizado', holderUid: 'u-luis', requesterUid: 'u-pepa', requesterName: 'Pepa' });
    await expect(call('u-luis', { requestId: 'r2', action: 'accept' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('hands it on even when the last holder’s request is gone with their account', async () => {
    await db().doc('cosaRequests/h1').delete();
    await seedRequest('r1', { cosaMode: 'colectivizado', holderUid: 'u-luis', status: 'accepted' });
    await expect(call('u-admin', { requestId: 'r1', action: 'lend' })).resolves.toEqual({ status: 'lent' });
    expect((await getDoc('cosas/carpa'))['heldBy']).toMatchObject({ requestId: 'r1', uid: 'u-ana' });
    expect((await db().doc('cosaRequests/h1').get()).exists).toBe(false);
  });

  it('an accepted request that was never handed over can still be cancelled or declined; the holder keeps it', async () => {
    await seedRequest('r1', { cosaMode: 'colectivizado', holderUid: 'u-luis', status: 'accepted' });
    await expect(call('u-ana', { requestId: 'r1', action: 'cancel' })).resolves.toEqual({ status: 'cancelled' });
    await seedRequest('r2', { cosaMode: 'colectivizado', holderUid: 'u-luis', requesterUid: 'u-pepa', requesterName: 'Pepa', status: 'accepted' });
    await expect(call('u-luis', { requestId: 'r2', action: 'decline' })).resolves.toEqual({ status: 'declined' });
    expect((await getDoc('cosas/carpa'))['heldBy']).toMatchObject({ requestId: 'h1', uid: 'u-luis' });
    expect(await getDoc('cosaRequests/h1')).toMatchObject({ status: 'lent' });
    // With nobody accepted any more, the next in line can be.
    await seedRequest('r3', { cosaMode: 'colectivizado', holderUid: 'u-luis', requesterUid: 'u-rosa', requesterName: 'Rosa' });
    await expect(call('u-luis', { requestId: 'r3', action: 'accept' })).resolves.toEqual({ status: 'accepted' });
  });

  it('the new holder’s other requests for it are moot once they have it', async () => {
    await seedRequest('r1', { cosaMode: 'colectivizado', holderUid: 'u-luis', status: 'accepted' });
    await seedRequest('r2', { cosaMode: 'colectivizado', holderUid: 'u-luis' });
    await call('u-luis', { requestId: 'r1', action: 'lend' });
    expect(await getDoc('cosaRequests/r2')).toMatchObject({ status: 'cancelled' });
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

  it("tells a colectivizado cosa's holder of a new request, not its owner", async () => {
    await notifyCosaRequest(db(), 'r4', null, req({ cosaMode: 'colectivizado', ownerUid: 'u-luis', holderUid: 'u-pepa' }), new Date());
    expect((await getDoc('users/u-pepa/notifications/cosa_r4_created'))['body']).toContain('que tienes tú ahora');
    expect((await db().doc('users/u-luis/notifications/cosa_r4_created').get()).exists).toBe(false);
  });

  it('tells the new holder, once, of each request a handover moved to them', async () => {
    const waiting = req({ cosaMode: 'colectivizado', holderUid: 'u-luis', requesterUid: 'u-pepa', requesterName: 'Pepa' });
    const moved = { ...waiting, holderUid: 'u-ana' };
    expect(cosaNoticeFor(waiting, moved)).toBe('created');
    await notifyCosaRequest(db(), 'r5', waiting, moved, new Date());
    expect((await getDoc('users/u-ana/notifications/cosa_r5_created'))['body']).toContain('Pepa te pide «Carpa», que tienes tú ahora');
    // A move back to nobody, or a write that changes neither, says nothing.
    expect(cosaNoticeFor(moved, { ...moved, holderUid: null })).toBeNull();
    expect(cosaNoticeFor(moved, moved)).toBeNull();
    expect(cosaNoticeFor({ ...waiting, status: 'accepted' }, { ...moved, status: 'accepted' })).toBeNull();
  });

  it('tells the requester a deleted cosa is no longer available, instead of a plain no', async () => {
    const pending = req();
    await notifyCosaRequest(db(), 'r6', pending, { ...pending, status: 'declined' }, new Date());
    expect((await getDoc('users/u-ana/notifications/cosa_r6_declined'))['body']).toContain('Esta vez no ha podido ser');
    await db().doc('cosas/carpa').delete();
    await notifyCosaRequest(db(), 'r7', pending, { ...pending, status: 'declined' }, new Date());
    expect((await getDoc('users/u-ana/notifications/cosa_r7_declined'))['body']).toContain('«Carpa» ya no está en la cosateca');
  });

  it('never tells an admin of their own request for the group’s cosa', async () => {
    await notifyCosaRequest(db(), 'r3', null, req({ requesterUid: 'u-admin', requesterName: 'Alcalde' }), new Date());
    expect((await db().doc('users/u-admin/notifications/cosa_r3_created').get()).exists).toBe(false);
    expect((await db().doc('users/u-admin2/notifications/cosa_r3_created').get()).exists).toBe(true);
  });
});

describe('closeDeletedCosaRequests', () => {
  it('closes every open request of a deleted cosa, frees its slot locks, and leaves the rest alone', async () => {
    await seedRequest('rp');
    await seedRequest('ra', { status: 'accepted', requesterUid: 'u-pepa', requesterName: 'Pepa' });
    await seedRequest('rl', { status: 'lent', requesterUid: 'u-rosa', requesterName: 'Rosa' });
    await seedRequest('rd', { status: 'returned' });
    await seedRequest('rx', { cosaId: 'otra' });
    await db().doc('cosas/carpa/slots/2026-07-01T16:00:00.000Z').set({ requestId: 'rp', startAt: new Date(), endAt: new Date(), status: 'pending' });
    await db().doc('cosas/carpa').delete();

    const now = new Date('2026-07-02T10:00:00Z');
    await expect(closeDeletedCosaRequests(db(), 'carpa', now)).resolves.toBe(3);

    for (const id of ['rp', 'ra']) {
      const r = await getDoc(`cosaRequests/${id}`);
      expect(r).toMatchObject({ status: 'declined' });
      expect((r['closedAt'] as { toDate(): Date }).toDate()).toEqual(now);
      expect(r['respondedAt']).toBeTruthy();
    }
    expect(await getDoc('cosaRequests/rl')).toMatchObject({ status: 'returned' });
    expect((await getDoc('cosaRequests/rl'))['closedAt']).toBeTruthy();
    expect(await getDoc('cosaRequests/rd')).toMatchObject({ status: 'returned', closedAt: null });
    expect(await getDoc('cosaRequests/rx')).toMatchObject({ status: 'pending' });
    expect((await db().collection('cosas/carpa/slots').get()).size).toBe(0);
  });

  it('runs when a cosa is deleted, and not when one is edited', async () => {
    await seedRequest('rp');
    const wrapped = ft.wrap(cleanupRemovedCosaImages as unknown as Parameters<typeof ft.wrap>[0]);
    const before = ft.firestore.makeDocumentSnapshot(cosa(), 'cosas/carpa');
    await wrapped({ data: ft.makeChange(before, ft.firestore.makeDocumentSnapshot(cosa({ title: 'Carpa grande' }), 'cosas/carpa')), params: { entityId: 'carpa' } } as unknown as Parameters<typeof wrapped>[0]);
    expect(await getDoc('cosaRequests/rp')).toMatchObject({ status: 'pending' });

    await db().doc('cosas/carpa').delete();
    const gone = ft.firestore.makeDocumentSnapshot({}, 'cosas/carpa');
    await wrapped({ data: ft.makeChange(before, gone), params: { entityId: 'carpa' } } as unknown as Parameters<typeof wrapped>[0]);
    expect(await getDoc('cosaRequests/rp')).toMatchObject({ status: 'declined' });
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
