// Handler tests for the cosateca's Phase 3 — the push of a request chat message
// (onCosaRequestChatCreated) and the overdue nudge (sendCosaReminders) — against
// the Firestore emulator.
import { describe, it, expect, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { handleCosaRequestChatMessage, handleCosaRequestChatMessageDeleted } from '../../../organizations/onCosaRequestChatCreated';
import { cosaOverdueCopy, runCosaReminders } from '../../../organizations/sendCosaReminders';
import { buildCosaRequestData, buildOrganizationData, type CosaRequestData } from '@cultuvilla/shared/models';

const ORG = 'ayto';
const db = () => admin.firestore();
// 2026-07-10 12:00 in Madrid.
const NOW = new Date('2026-07-10T10:00:00Z');

function req(overrides: Partial<CosaRequestData> = {}): CosaRequestData {
  return {
    ...buildCosaRequestData({
      municipalityId: 'mun-1', orgId: ORG, cosaId: 'carpa', cosaTitle: 'Carpa', cosaKind: 'prestamo', ownerUid: null,
      requesterUid: 'u-ana', requesterName: 'Ana', createdAt: new Date('2026-06-01'),
    }),
    ...overrides,
  };
}

const notificationsOf = async (uid: string) => (await db().collection(`users/${uid}/notifications`).get()).docs;
const message = (authorUid: string, authorName: string) => ({
  authorUid, authorName, body: 'Paso a por ella el sábado', createdAt: admin.firestore.Timestamp.fromDate(NOW),
});

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
});

describe('onCosaRequestChatCreated', () => {
  it("pushes a group cosa's chat message to the other side: the requester's to the group's admins", async () => {
    await db().doc('cosaRequests/r1').set(req());
    const pushed = await handleCosaRequestChatMessage(db(), { requestId: 'r1', chatId: 'm1' }, message('u-ana', 'Ana'));
    expect(pushed).toBe(2);
    expect(await notificationsOf('u-ana')).toHaveLength(0);
    const [n] = await notificationsOf('u-admin');
    expect(n.id).toBe('cosa_chat_r1_m1');
    expect(n.data()).toMatchObject({
      type: 'group_task', title: '«Carpa»', body: 'Ana: Paso a por ella el sábado', entityKind: 'organization', entityId: ORG, cosaRequestId: 'r1',
    });
    expect(await notificationsOf('u-admin2')).toHaveLength(1);
    expect(await notificationsOf('u-luis')).toHaveLength(0);
  });

  it("pushes a personal cosa's chat between requester and owner only, not the group's admins", async () => {
    await db().doc('cosaRequests/r2').set(req({ ownerUid: 'u-luis' }));
    await handleCosaRequestChatMessage(db(), { requestId: 'r2', chatId: 'm1' }, message('u-luis', 'Luis'));
    expect(await notificationsOf('u-ana')).toHaveLength(1);
    expect(await notificationsOf('u-admin')).toHaveLength(0);
    // A redelivered event rewrites the same notification.
    await handleCosaRequestChatMessage(db(), { requestId: 'r2', chatId: 'm1' }, message('u-luis', 'Luis'));
    expect(await notificationsOf('u-ana')).toHaveLength(1);
  });

  it('pushes nothing for a malformed message or a missing request', async () => {
    await db().doc('cosaRequests/r1').set(req());
    expect(await handleCosaRequestChatMessage(db(), { requestId: 'r1', chatId: 'm1' }, { body: 'x' })).toBe(0);
    expect(await handleCosaRequestChatMessage(db(), { requestId: 'gone', chatId: 'm1' }, message('u-ana', 'Ana'))).toBe(0);
  });

  it('skips a recipient who has blocked the author', async () => {
    await db().doc('cosaRequests/r1').set(req());
    await db().doc('users/u-admin2/blockedUsers/u-ana').set({ blockedUserId: 'u-ana', createdAt: NOW });
    const pushed = await handleCosaRequestChatMessage(db(), { requestId: 'r1', chatId: 'm1' }, message('u-ana', 'Ana'));
    expect(pushed).toBe(1);
    expect(await notificationsOf('u-admin')).toHaveLength(1);
    expect(await notificationsOf('u-admin2')).toHaveLength(0);
  });

  it("a deleted message takes its notifications with it, and leaves the request's other ones", async () => {
    await db().doc('cosaRequests/r1').set(req());
    await handleCosaRequestChatMessage(db(), { requestId: 'r1', chatId: 'm1' }, message('u-ana', 'Ana'));
    await handleCosaRequestChatMessage(db(), { requestId: 'r1', chatId: 'm2' }, message('u-admin', 'Pepa'));
    await handleCosaRequestChatMessageDeleted(db(), { requestId: 'r1', chatId: 'm1' });
    expect(await notificationsOf('u-admin')).toHaveLength(0);
    expect((await notificationsOf('u-admin2')).map((d) => d.id)).toEqual(['cosa_chat_r1_m2']);
    expect((await notificationsOf('u-ana')).map((d) => d.id)).toEqual(['cosa_chat_r1_m2']);
  });

  it('a deleted message under a request that is gone removes its notifications too', async () => {
    await db().doc('cosaRequests/r1').set(req());
    await handleCosaRequestChatMessage(db(), { requestId: 'r1', chatId: 'm1' }, message('u-ana', 'Ana'));
    await db().doc('cosaRequests/r1').delete();
    await handleCosaRequestChatMessageDeleted(db(), { requestId: 'r1', chatId: 'm1' });
    expect(await notificationsOf('u-admin')).toHaveLength(0);
    expect(await notificationsOf('u-admin2')).toHaveLength(0);
  });
});

describe('cosaOverdueCopy', () => {
  it('drops the group from the title when its name is unknown', () => {
    const r = req({ untilOn: '2026-07-09' });
    expect(cosaOverdueCopy('holder', r, '').title).toBe('Toca devolver');
    expect(cosaOverdueCopy('manager', r, '').title).toBe('No ha vuelto');
    expect(cosaOverdueCopy('holder', r, 'Ayto').title).toBe('Toca devolver · Ayto');
  });
});

describe('sendCosaReminders', () => {
  // Only an integrante's own cosa comes back, so only it is ever overdue.
  const lent = (overrides: Partial<CosaRequestData>) => req({ ownerUid: 'u-luis', status: 'lent', ...overrides });

  it('nudges the holder and the owner once, the day after a lent cosa was due back', async () => {
    await db().doc('cosaRequests/late').set(lent({ untilOn: '2026-07-09' }));
    await db().doc('cosaRequests/today').set(lent({ untilOn: '2026-07-10' }));
    await db().doc('cosaRequests/back').set(lent({ status: 'returned', untilOn: '2026-07-01' }));
    await db().doc('cosaRequests/open').set(lent({ untilOn: null }));

    await expect(runCosaReminders(db(), NOW)).resolves.toEqual({ overdueCount: 1, notificationCount: 2 });
    const [holder] = await notificationsOf('u-ana');
    expect(holder.id).toBe('cosa_late_overdue');
    expect(holder.data()).toMatchObject({ type: 'group_task', cosaRequestId: 'late', title: 'Toca devolver · Ayuntamiento de Villa' });
    expect((await notificationsOf('u-luis'))[0]?.data()).toMatchObject({ title: 'No ha vuelto · Ayuntamiento de Villa' });
    // The group's admins are the backstop, not nudged.
    expect(await notificationsOf('u-admin')).toHaveLength(0);
    expect((await db().doc('cosaRequests/late').get()).get('overdueNotifiedOn')).toBe('2026-07-10');
    expect((await db().doc('cosaRequests/today').get()).get('overdueNotifiedOn')).toBeNull();

    // The next day's run does not nudge it again.
    await expect(runCosaReminders(db(), new Date('2026-07-11T10:00:00Z'))).resolves.toEqual({ overdueCount: 1, notificationCount: 2 });
    expect((await db().doc('cosaRequests/late').get()).get('overdueNotifiedOn')).toBe('2026-07-10');
    expect((await db().doc('cosaRequests/today').get()).get('overdueNotifiedOn')).toBe('2026-07-11');
  });

  it("never nudges the group's cosa: it is shared, not coming back", async () => {
    // A stray return day on one must not wake the job either.
    await db().doc('cosaRequests/c').set(req({ status: 'lent', untilOn: '2026-07-01', ownerUid: null }));
    await expect(runCosaReminders(db(), NOW)).resolves.toEqual({ overdueCount: 0, notificationCount: 0 });
  });
});
