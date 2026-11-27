// Scheduled flush of the pushes quiet hours held overnight.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as admin from 'firebase-admin';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { deleteAfterQuery } from '../../helpers/deletedSubject';
import { flushPushQueue } from '../../../push/flushPushQueue';

vi.mock('../../../push/secret', () => ({ APNS_AUTH_KEY: { value: () => '' } }));
const { deliverPush } = vi.hoisted(() => ({
  deliverPush: vi.fn(() => Promise.resolve({ delivered: 2, failed: 0 })),
}));
vi.mock('../../../push/deliverPush', () => ({ deliverPush }));



const db = () => admin.firestore();
const ts = (iso: string) => admin.firestore.Timestamp.fromDate(new Date(iso));

async function seedEntry(id: string, sendAfter: string, notificationExists: boolean) {
  const [userId, notificationId] = id.split('__');
  await db().doc(`pushQueue/${id}`).set({
    userId,
    notificationId,
    category: 'village',
    sendAfter: ts(sendAfter),
    createdAt: ts('2026-01-01T00:00:00Z'),
    sentAt: null,
    deliveredCount: 0,
    failedCount: 0,
  });
  if (notificationExists) {
    await db().doc(`users/${userId}/notifications/${notificationId}`).set({
      type: 'village_entity_published',
      title: 't',
      body: 'b',
      eventId: null,
      municipalityId: 'mun',
      requesterUid: null,
      entityKind: 'news',
      entityId: 'p1',
      read: false,
      createdAt: ts('2026-01-01T00:00:00Z'),
    });
  }
}

beforeEach(async () => {
  await resetEmulators();
  deliverPush.mockClear();
});

describe('flushPushQueue', () => {
  it('sends what is due, leaves what is not, and retires orphans', async () => {
    await seedEntry('u1__due', '2020-01-01T00:00:00Z', true);
    await seedEntry('u1__future', '2999-01-01T00:00:00Z', true);
    await seedEntry('u2__orphan', '2020-01-01T00:00:00Z', false);

    await flushPushQueue.run({ scheduleTime: new Date().toISOString() });

    expect(deliverPush).toHaveBeenCalledTimes(1);
    expect(deliverPush.mock.calls[0]).toEqual(['u1', 'due', expect.objectContaining({ entityKind: 'news' })]);

    const due = (await db().doc('pushQueue/u1__due').get()).data();
    expect(due?.['sentAt']).not.toBeNull();
    expect(due?.['deliveredCount']).toBe(2);

    expect((await db().doc('pushQueue/u1__future').get()).data()?.['sentAt']).toBeNull();

    // The account (or notification) went away while it waited: retired, never retried.
    expect((await db().doc('pushQueue/u2__orphan').get()).data()?.['sentAt']).not.toBeNull();
  });

  it('keeps flushing when an account deletion removed an entry after the sweep read it', async () => {
    await seedEntry('u3__gone', '2020-01-01T00:00:00Z', false);
    await seedEntry('u1__due', '2020-01-01T00:00:00Z', true);

    const race = deleteAfterQuery('pushQueue/u3__gone');
    try {
      await expect(flushPushQueue.run({ scheduleTime: new Date().toISOString() })).resolves.not.toThrow();
    } finally {
      race.restore();
    }

    expect((await db().doc('pushQueue/u3__gone').get()).exists).toBe(false);
    expect((await db().doc('pushQueue/u1__due').get()).data()?.['sentAt']).not.toBeNull();
  });
});
