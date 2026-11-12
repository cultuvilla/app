// Handler tests for the cosateca's reservas (the pádel court) — booking through
// bookReservaSlot, answering and cancelling a booking (its slot lock), closing
// days through setReservaBlackouts, and the reminder an hour before — against
// the Firestore emulator. Every call takes a fixed `now`.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { applyBookReservaSlot, bookReservaSlot } from '../../../organizations/bookReservaSlot';
import { applyCosaRequestAction } from '../../../organizations/respondToCosaRequest';
import { applyReservaBlackouts } from '../../../organizations/setReservaBlackouts';
import { expireReservaBookings, sendReservaReminders } from '../../../organizations/sendReservaReminders';
import { cosaNoticeFor, cosaRequestCopy } from '../../../organizations/onCosaRequestWritten';
import { buildOrganizationData, DEFAULT_RESERVA_CONFIG, type CosaRequestData, type ReservaConfig } from '@cultuvilla/shared/models';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG = 'ayto';
const MUN = 'mun-1';
const db = () => admin.firestore();
// Tuesday 10 November 2026, 11:00 in Madrid.
const NOW = new Date('2026-11-10T10:00:00.000Z');
// Thursday 12 November, 18:00 and 19:00 in Madrid.
const SLOT_18 = new Date('2026-11-12T17:00:00.000Z');
const SLOT_19 = new Date('2026-11-12T18:00:00.000Z');

function pista(reserva: Partial<ReservaConfig> = {}, overrides: Record<string, unknown> = {}) {
  return {
    municipalityId: MUN, orgId: ORG, audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', kind: 'reserva', mode: null,
    title: 'Pista de pádel', description: null, category: 'deporte', imageURL: null, conditions: null, location: null, locationNote: null, status: 'available',
    heldBy: null, reserva: { ...DEFAULT_RESERVA_CONFIG, ...reserva }, createdBy: 'u-admin',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...overrides,
  };
}

const getDoc = async (path: string) => (await db().doc(path).get()).data() as Record<string, unknown> | undefined;
const book = (uid: string, startAt: Date, now = NOW) => applyBookReservaSlot(db(), uid, { cosaId: 'pista', startAt, message: null }, now);

beforeEach(async () => {
  await resetEmulators();
  await db().doc(`organizations/${ORG}`).set(
    buildOrganizationData({
      name: 'Ayuntamiento de Villa', type: 'ayuntamiento', status: 'approved', municipalityId: MUN, villageSlug: 'villa',
      requestedBy: 'u-admin', cosateca: { enabled: true, audience: 'pueblo' },
    }),
  );
  await db().doc(`organizations/${ORG}/members/u-admin`).set({ userId: 'u-admin', joinedAt: new Date('2025-01-01'), role: 'admin' });
  for (const [uid, name] of [['u-ana', 'Ana'], ['u-luis', 'Luis'], ['u-fuera', 'Forastera']] as const) {
    await db().doc(`publicProfiles/${uid}`).set({ displayName: name });
  }
  for (const uid of ['u-ana', 'u-luis']) await db().doc(`municipalities/${MUN}/members/${uid}`).set({ role: 'user' });
  await db().doc('cosas/pista').set(pista());
});

afterAll(() => {
  ft.cleanup();
});

describe('bookReservaSlot', () => {
  it('books a free slot as confirmed, with its lock, its day and the booker’s public name', async () => {
    const { requestId, status } = await book('u-ana', SLOT_18);
    expect(status).toBe('accepted');
    const booking = await getDoc(`cosaRequests/${requestId}`);
    expect(booking).toMatchObject({
      cosaKind: 'reserva', requesterUid: 'u-ana', requesterName: 'Ana', status: 'accepted', fromOn: '2026-11-12', untilOn: '2026-11-12',
    });
    expect((booking?.['startAt'] as admin.firestore.Timestamp).toDate()).toEqual(SLOT_18);
    expect(booking?.['respondedAt']).toBeTruthy();
    expect(await getDoc(`cosas/pista/slots/${SLOT_18.toISOString()}`)).toMatchObject({ requestId, status: 'accepted' });
  });

  it('leaves a slot to whoever took it first', async () => {
    await book('u-ana', SLOT_18);
    await expect(book('u-luis', SLOT_18)).rejects.toMatchObject({ code: 'already-exists' });
    const all = await db().collection('cosaRequests').get();
    expect(all.size).toBe(1);
  });

  it('refuses a slot that overlaps a booking made under the old hours', async () => {
    await book('u-ana', SLOT_18); // 18:00–19:00 Madrid
    // The manager moves opening to 09:30: the grid now offers 18:30, a key no lock holds.
    const halfPast = { opensAt: '09:30', closesAt: '22:00' };
    await db().doc('cosas/pista').set(
      pista({ hours: Object.fromEntries(Object.keys(DEFAULT_RESERVA_CONFIG.hours).map((d) => [d, halfPast])) as ReservaConfig['hours'] }),
    );
    await expect(book('u-luis', new Date('2026-11-12T17:30:00.000Z'))).rejects.toMatchObject({ code: 'already-exists' });
    await expect(book('u-luis', new Date('2026-11-12T18:30:00.000Z'))).resolves.toMatchObject({ status: 'accepted' });
  });

  it('books as pending when the cosa asks for approval', async () => {
    await db().doc('cosas/pista').set(pista({ requiresApproval: true }));
    await expect(book('u-ana', SLOT_18)).resolves.toMatchObject({ status: 'pending' });
  });

  it('holds the per-person cap over upcoming bookings only', async () => {
    await db().doc('cosas/pista').set(pista({ maxActiveReservations: 1 }));
    await book('u-ana', SLOT_18);
    await expect(book('u-ana', SLOT_19)).rejects.toMatchObject({ code: 'resource-exhausted' });
    // Once the first one has passed, it no longer counts.
    await expect(book('u-ana', new Date('2026-11-13T17:00:00.000Z'), new Date('2026-11-12T19:00:00.000Z'))).resolves.toMatchObject({
      status: 'accepted',
    });
  });

  it('refuses what is not a slot of the grid, a past one, one beyond the horizon or on a closed day', async () => {
    await expect(book('u-ana', new Date('2026-11-12T17:30:00.000Z'))).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(book('u-ana', new Date('2026-11-10T08:00:00.000Z'))).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(book('u-ana', new Date('2026-12-10T17:00:00.000Z'))).rejects.toMatchObject({ code: 'failed-precondition' });
    await db().doc('cosas/pista').set(pista({ blackouts: ['2026-11-12'] }));
    await expect(book('u-ana', SLOT_18)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses someone who may not see it, a paused one, and a cosateca switched off', async () => {
    await expect(book('u-fuera', SLOT_18)).rejects.toMatchObject({ code: 'permission-denied' });
    await db().doc('cosas/pista').update({ status: 'paused' });
    await expect(book('u-ana', SLOT_18)).rejects.toMatchObject({ code: 'failed-precondition' });
    await db().doc('cosas/pista').update({ status: 'available' });
    await db().doc(`organizations/${ORG}`).update({ cosateca: { enabled: false, audience: 'pueblo' } });
    await expect(book('u-ana', SLOT_18)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects the unauthenticated and bad arguments', async () => {
    const wrapped = ft.wrap(bookReservaSlot as unknown as Parameters<typeof ft.wrap>[0]);
    const call = (uid: string | null, data: unknown) =>
      wrapped({ data, auth: uid ? { uid, token: {} } : undefined } as unknown as Parameters<typeof wrapped>[0]) as Promise<unknown>;
    await expect(call(null, { cosaId: 'pista', startAt: SLOT_18.toISOString() })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call('u-ana', { cosaId: 'pista', startAt: 'mañana' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('answering a booking', () => {
  it('the booker cancelling frees the slot for someone else', async () => {
    const { requestId } = await book('u-ana', SLOT_18);
    await expect(applyCosaRequestAction(db(), 'u-ana', requestId, 'cancel', NOW)).resolves.toBe('cancelled');
    expect(await getDoc(`cosas/pista/slots/${SLOT_18.toISOString()}`)).toBeUndefined();
    await expect(book('u-luis', SLOT_18)).resolves.toMatchObject({ status: 'accepted' });
  });

  it('accepting a pending booking confirms its lock; declining frees it', async () => {
    await db().doc('cosas/pista').set(pista({ requiresApproval: true }));
    const a = await book('u-ana', SLOT_18);
    const b = await book('u-luis', SLOT_19);
    await applyCosaRequestAction(db(), 'u-admin', a.requestId, 'accept', NOW);
    expect(await getDoc(`cosas/pista/slots/${SLOT_18.toISOString()}`)).toMatchObject({ status: 'accepted' });
    await applyCosaRequestAction(db(), 'u-admin', b.requestId, 'decline', NOW);
    expect(await getDoc(`cosas/pista/slots/${SLOT_19.toISOString()}`)).toBeUndefined();
  });

  it('a booking that has started is past answering', async () => {
    const { requestId } = await book('u-ana', SLOT_18);
    await expect(applyCosaRequestAction(db(), 'u-ana', requestId, 'cancel', new Date('2026-11-12T17:30:00.000Z'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('setReservaBlackouts', () => {
  it('closing a day cancels the bookings on it and frees their slots, and leaves the rest', async () => {
    const onDay = await book('u-ana', SLOT_18);
    const nextDay = await book('u-luis', new Date('2026-11-13T17:00:00.000Z'));
    await expect(applyReservaBlackouts(db(), 'u-admin', 'pista', ['2026-11-12'], NOW)).resolves.toEqual({ cancelled: 1 });
    expect(await getDoc(`cosaRequests/${onDay.requestId}`)).toMatchObject({ status: 'declined' });
    expect(await getDoc(`cosas/pista/slots/${SLOT_18.toISOString()}`)).toBeUndefined();
    expect(await getDoc(`cosaRequests/${nextDay.requestId}`)).toMatchObject({ status: 'accepted' });
    expect((await getDoc('cosas/pista'))?.['reserva']).toMatchObject({ blackouts: ['2026-11-12'] });
  });

  it('reopening a day cancels nothing', async () => {
    await db().doc('cosas/pista').set(pista({ blackouts: ['2026-11-20'] }));
    await book('u-ana', SLOT_18);
    await expect(applyReservaBlackouts(db(), 'u-admin', 'pista', [], NOW)).resolves.toEqual({ cancelled: 0 });
  });

  it('only its managers close days', async () => {
    await expect(applyReservaBlackouts(db(), 'u-ana', 'pista', ['2026-11-12'], NOW)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('sendReservaReminders', () => {
  it('reminds the booker of a confirmed booking 30 to 90 minutes out, once', async () => {
    const { requestId } = await book('u-ana', SLOT_18);
    await book('u-luis', SLOT_19);
    const runAt = new Date('2026-11-12T16:00:00.000Z'); // 17:00 Madrid: the 18:00 booking is an hour out
    await expect(sendReservaReminders(db(), runAt)).resolves.toBe(1);
    const n = await getDoc(`users/u-ana/notifications/cosa_${requestId}_reminder`);
    expect(n).toMatchObject({ type: 'group_task', cosaRequestId: requestId, title: 'Tienes reserva · Ayuntamiento de Villa' });
    expect(String(n?.['body'])).toContain('a las 18:00');
    await expect(sendReservaReminders(db(), runAt)).resolves.toBe(0);
  });
});

describe('expireReservaBookings', () => {
  it('declines a pending booking nobody answered before it started, frees its slot, once', async () => {
    await db().doc('cosas/pista').set(pista({ requiresApproval: true }));
    const late = await book('u-ana', SLOT_18);
    const later = await book('u-luis', new Date('2026-11-13T17:00:00.000Z'));
    const runAt = new Date('2026-11-12T17:05:00.000Z');
    await expect(expireReservaBookings(db(), runAt)).resolves.toBe(1);
    const expired = await getDoc(`cosaRequests/${late.requestId}`);
    expect(expired).toMatchObject({ status: 'declined' });
    expect((expired?.['closedAt'] as admin.firestore.Timestamp).toDate()).toEqual(runAt);
    expect(await getDoc(`cosas/pista/slots/${SLOT_18.toISOString()}`)).toBeUndefined();
    expect(await getDoc(`cosaRequests/${later.requestId}`)).toMatchObject({ status: 'pending' });
    await expect(expireReservaBookings(db(), runAt)).resolves.toBe(0);
  });

  it('leaves a confirmed booking that has started alone', async () => {
    const { requestId } = await book('u-ana', SLOT_18);
    await expect(expireReservaBookings(db(), new Date('2026-11-12T17:05:00.000Z'))).resolves.toBe(0);
    expect(await getDoc(`cosaRequests/${requestId}`)).toMatchObject({ status: 'accepted' });
  });
});

describe('booking notices', () => {
  const booking = (status: CosaRequestData['status']) =>
    ({
      municipalityId: MUN, orgId: ORG, cosaId: 'pista', cosaTitle: 'Pista de pádel', cosaKind: 'reserva', cosaMode: null, ownerUid: null, holderUid: null,
      requesterUid: 'u-ana', requesterName: 'Ana', message: null, fromOn: '2026-11-12', untilOn: '2026-11-12', status,
      createdAt: NOW, respondedAt: null, closedAt: null, overdueNotifiedOn: null, startAt: SLOT_18, endAt: SLOT_19,
    }) satisfies CosaRequestData;

  it('a confirmed booking needs no one’s answer, and letting it go tells no one', () => {
    expect(cosaNoticeFor(null, booking('accepted'))).toBeNull();
    expect(cosaNoticeFor(booking('accepted'), booking('cancelled'))).toBeNull();
    expect(cosaNoticeFor(null, booking('pending'))).toBe('created');
    expect(cosaNoticeFor(booking('pending'), booking('cancelled'))).toBe('cancelled');
  });

  it('names the slot, and says a closed day annulled a confirmed booking', () => {
    expect(cosaRequestCopy('accepted', booking('accepted'), 'Ayto').body).toContain('a las 18:00');
    expect(cosaRequestCopy('declined', booking('declined'), 'Ayto', true).title).toBe('Reserva anulada · Ayto');
    expect(cosaRequestCopy('declined', booking('declined'), 'Ayto', false).title).toBe('Reserva no aceptada · Ayto');
    const expired = { ...booking('declined'), closedAt: new Date(SLOT_18.getTime() + 300_000) };
    expect(cosaRequestCopy('declined', expired, 'Ayto', false)).toEqual({
      title: 'Reserva sin confirmar · Ayto',
      body: 'Nadie confirmó a tiempo tu reserva de «Pista de pádel» el jueves, 12 de noviembre de 2026 a las 18:00.',
    });
  });
});
