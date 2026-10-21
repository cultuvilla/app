// Trigger test for onNotificationCreated: the seam between the notification
// log and a device. deliverPush is mocked — the platform transports have their
// own tests; this asserts the decisions made BEFORE a send (preferences, quiet
// hours, at-least-once dedup).
import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { onNotificationCreated } from '../../../push/onNotificationCreated';

vi.mock('../../../push/secret', () => ({ APNS_AUTH_KEY: { value: () => '' } }));
const { deliverPush } = vi.hoisted(() => ({
  deliverPush: vi.fn(() => Promise.resolve({ delivered: 1, failed: 0 })),
}));
vi.mock('../../../push/deliverPush', () => ({ deliverPush }));


const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(onNotificationCreated);

const UID = 'user-1';

function notification(type: string, extra: Record<string, unknown> = {}) {
  return {
    type,
    title: 't',
    body: 'b',
    eventId: null,
    municipalityId: 'mun',
    requesterUid: null,
    entityKind: null,
    entityId: null,
    read: false,
    createdAt: admin.firestore.Timestamp.now(),
    ...extra,
  };
}

// The snapshot is built in memory — no write to the notifications path — so no
// other trigger can race this one for the queue doc.
async function fire(notifId: string, data: Record<string, unknown>): Promise<void> {
  await wrapped({
    data: ft.firestore.makeDocumentSnapshot(data, `users/${UID}/notifications/${notifId}`),
    params: { userId: UID, notifId },
  } as unknown as Parameters<typeof wrapped>[0]);
}

const queueDoc = (notifId: string) => admin.firestore().doc(`pushQueue/${UID}__${notifId}`).get();

beforeEach(async () => {
  await resetEmulators();
  deliverPush.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  ft.cleanup();
});

describe('onNotificationCreated', () => {
  it('sends a seat notification immediately and stamps the queue entry', async () => {
    await fire('n1', notification('waitlist_promoted', { eventId: 'ev1' }));

    expect(deliverPush).toHaveBeenCalledTimes(1);
    expect(deliverPush.mock.calls[0]).toEqual([UID, 'n1', expect.objectContaining({ type: 'waitlist_promoted' })]);
    const q = await queueDoc('n1');
    expect(q.data()).toMatchObject({ category: 'mine', deliveredCount: 1, failedCount: 0 });
    expect(q.data()?.['sentAt']).not.toBeNull();
  });

  it('never sends the same notification twice when the trigger is redelivered', async () => {
    const data = notification('event_cancelled', { eventId: 'ev1' });
    await fire('n2', data);
    await fire('n2', data);
    expect(deliverPush).toHaveBeenCalledTimes(1);
  });

  it('respects a muted category — and keeps no queue entry for it', async () => {
    await admin.firestore().doc(`users/${UID}/preferences/notifications`).set({
      mine: true,
      village: false,
      social: true,
      quietHours: true,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    await fire('n3', notification('village_entity_published', { entityKind: 'news', entityId: 'p1' }));
    expect(deliverPush).not.toHaveBeenCalled();
    expect((await queueDoc('n3')).exists).toBe(false);
  });

  it('mutes one group’s messages, and only that group’s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
    await admin.firestore().doc(`users/${UID}/groupPrefs/org-muted`).set({ messagesMuted: true, updatedAt: admin.firestore.Timestamp.now() });
    await fire('g1', notification('group_message', { entityKind: 'organization', entityId: 'org-muted' }));
    expect(deliverPush).not.toHaveBeenCalled();
    expect((await queueDoc('g1')).exists).toBe(false);

    await fire('g2', notification('group_message', { entityKind: 'organization', entityId: 'org-other' }));
    expect(deliverPush).toHaveBeenCalledTimes(1);
    expect((await queueDoc('g2')).data()).toMatchObject({ category: 'groups' });
  });

  it('never lets a group mute hold back the cuota reminder', async () => {
    await admin.firestore().doc(`users/${UID}/groupPrefs/org-muted`).set({ messagesMuted: true, updatedAt: admin.firestore.Timestamp.now() });
    await fire('c1', notification('cuota_reminder', { entityKind: 'organization', entityId: 'org-muted' }));
    expect(deliverPush).toHaveBeenCalledTimes(1);
  });

  it('holds a village broadcast overnight until 08:00 Madrid', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T21:30:00Z')); // 23:30 CEST

    await fire('n4', notification('village_entity_published', { entityKind: 'event', entityId: 'e1' }));

    expect(deliverPush).not.toHaveBeenCalled();
    const q = (await queueDoc('n4')).data();
    expect(q?.['sentAt']).toBeNull();
    expect((q?.['sendAfter'] as admin.firestore.Timestamp).toDate()).toEqual(new Date('2026-07-16T06:00:00Z'));
  });

  it('still sends seat news overnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T01:00:00Z')); // 03:00 CEST
    await fire('n5', notification('waitlist_promoted', { eventId: 'ev1' }));
    expect(deliverPush).toHaveBeenCalledTimes(1);
  });

  it('sends a broadcast overnight when the user turned quiet hours off', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T01:00:00Z'));
    await admin.firestore().doc(`users/${UID}/preferences/notifications`).set({
      mine: true,
      village: true,
      social: true,
      quietHours: false,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    await fire('n6', notification('village_entity_published', { entityKind: 'event', entityId: 'e1' }));
    expect(deliverPush).toHaveBeenCalledTimes(1);
  });

  it('refuses a doc that does not match the schema instead of pushing garbage', async () => {
    await fire('n7', { type: 'not_a_type', title: 't' });
    expect(deliverPush).not.toHaveBeenCalled();
  });
});
