// Handler tests for the cosateca's Phase 3 — the push of a request chat message
// (onCosaRequestChatCreated) and the overdue nudge (sendCosaReminders) — against
// the Firestore emulator.
import { describe, it, expect, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { handleCosaRequestChatMessage } from '../../../organizations/onCosaRequestChatCreated';
import { runCosaReminders } from '../../../organizations/sendCosaReminders';
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
});

describe('sendCosaReminders', () => {
  it('nudges the holder and the managers once, the day after a lent cosa was due back', async () => {
    await db().doc('cosaRequests/late').set(req({ status: 'lent', untilOn: '2026-07-09' }));
    await db().doc('cosaRequests/today').set(req({ status: 'lent', untilOn: '2026-07-10' }));
    await db().doc('cosaRequests/back').set(req({ status: 'returned', untilOn: '2026-07-01' }));
    await db().doc('cosaRequests/open').set(req({ status: 'lent', untilOn: null }));

    await expect(runCosaReminders(db(), NOW)).resolves.toEqual({ overdueCount: 1, notificationCount: 3 });
    const [holder] = await notificationsOf('u-ana');
    expect(holder.id).toBe('cosa_late_overdue');
    expect(holder.data()).toMatchObject({ type: 'group_task', cosaRequestId: 'late', title: 'Toca devolver · Ayuntamiento de Villa' });
    expect((await notificationsOf('u-admin'))[0]?.data()).toMatchObject({ title: 'No ha vuelto · Ayuntamiento de Villa' });
    expect((await db().doc('cosaRequests/late').get()).get('overdueNotifiedOn')).toBe('2026-07-10');
    expect((await db().doc('cosaRequests/today').get()).get('overdueNotifiedOn')).toBeNull();

    // The next day's run does not nudge it again.
    await expect(runCosaReminders(db(), new Date('2026-07-11T10:00:00Z'))).resolves.toEqual({ overdueCount: 1, notificationCount: 3 });
    expect((await db().doc('cosaRequests/late').get()).get('overdueNotifiedOn')).toBe('2026-07-10');
    expect((await db().doc('cosaRequests/today').get()).get('overdueNotifiedOn')).toBe('2026-07-11');
  });

  it("tells a personal cosa's owner, and an admin who borrowed the group's cosa only once", async () => {
    await db().doc('cosaRequests/p').set(req({ status: 'lent', untilOn: '2026-07-01', ownerUid: 'u-luis' }));
    await db().doc('cosaRequests/a').set(req({ status: 'lent', untilOn: '2026-07-01', requesterUid: 'u-admin', requesterName: 'Alcalde' }));
    await runCosaReminders(db(), NOW);
    expect(await notificationsOf('u-luis')).toHaveLength(1);
    // u-admin holds `a` (holder) and manages nothing else here: one nudge, as the holder.
    const adminNotices = await notificationsOf('u-admin');
    expect(adminNotices.map((d) => d.data()['title'])).toEqual(['Toca devolver · Ayuntamiento de Villa']);
    expect(await notificationsOf('u-admin2')).toHaveLength(1);
  });
});
