// Handler tests for the group messaging callables, against the Firestore emulator.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';

const { sendEmailBatchMock } = vi.hoisted(() => ({
  sendEmailBatchMock: vi.fn((emails: unknown[]) => Promise.resolve(emails.map((): 'sent' | 'failed' | 'skipped' => 'sent'))),
}));
vi.mock('../../../shared/email', () => ({ sendEmailBatch: sendEmailBatchMock }));

import { runSendGroupMessage, sendGroupMessage } from '../../../organizations/sendGroupMessage';
import { runNudgeGroupMessage } from '../../../organizations/nudgeGroupMessage';
import { buildEventData, buildRegistrationData, type SendGroupMessageInput } from '@cultuvilla/shared/models';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG_ID = 'org-1';
const db = () => admin.firestore();
const NOW = new Date('2026-10-21T10:00:00Z');

async function seedOrg(type = 'asociación') {
  await db().doc(`organizations/${ORG_ID}`).set({
    name: 'La Anduela', description: null, images: [], type, status: 'approved', municipalityId: 'mun-1',
    villageSlug: 'villa', requestedBy: 'founder', reviewedBy: null, createdAt: new Date(), reviewedAt: null,
    commentCount: 0, readCount: 0, memberCount: 0, membersPublic: true, joinPolicy: 'open', sociosListVisible: false,
  });
}

async function seedUser(uid: string) {
  await db().doc(`users/${uid}`).set({
    displayName: uid, email: `${uid}@x.es`, telephone: null, activeMunicipalityId: null, personId: null,
    createdAt: new Date(), termsAcceptedAt: new Date(), termsVersion: '1',
  });
}

async function seedSocio(id: string, overrides: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}/socios/${id}`).set({
    kind: 'member', socioNumber: null, displayName: id, uid: null, personId: null, responsibleUid: null, adminTitle: null,
    altaAt: new Date('2025-01-01T10:00:00Z'), bajaAt: null, memberJoinedAt: null, createdBy: 'x', ...overrides,
  });
}

async function seedMember(uid: string, socioId: string, role: 'admin' | 'member' = 'member', overrides: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}/members/${uid}`).set({ userId: uid, joinedAt: new Date('2025-01-01'), role });
  await seedUser(uid);
  await seedSocio(socioId, { uid, displayName: socioId, ...overrides });
}

function input(over: Partial<SendGroupMessageInput> = {}): SendGroupMessageInput {
  return {
    orgId: ORG_ID,
    messageId: 'Msg0000000001',
    title: 'Asamblea',
    body: 'El sábado a las 18:00 en el local.',
    audience: { kind: 'all', eventId: null },
    channels: { push: true, email: true, whatsapp: 'fallback' },
    pinned: true,
    poll: null,
    ...over,
  };
}

async function notificationsOf(uid: string) {
  return (await db().collection(`users/${uid}/notifications`).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
}

async function deliveries(messageId = 'Msg0000000001') {
  const snap = await db().collection(`organizations/${ORG_ID}/messages/${messageId}/deliveries`).get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
}

beforeEach(async () => {
  await resetEmulators();
  sendEmailBatchMock.mockClear();
  await seedOrg();
  // Luis (presidente) sends; Eva is the other admin; Paco a member with a
  // persona a cargo; Pepa typed in with a phone and no email.
  await seedMember('u-luis', 'Luis', 'admin', { adminTitle: 'presidente' });
  await seedMember('u-eva', 'Eva', 'admin');
  await seedMember('u-paco', 'Paco');
  await seedSocio('Nene', { kind: 'persona', personId: 'p-nene', responsibleUid: 'u-paco' });
  await seedSocio('Pepa', { kind: 'typed' });
  await db().doc(`organizations/${ORG_ID}/socioPrivate/Pepa`).set({ phone: '600 111 222', email: null, consentAnsweredAt: null });
  await db().doc(`organizations/${ORG_ID}/socioPrivate/Paco`).set({ phone: '611222333', email: 'paco@compartido.es', consentAnsweredAt: new Date() });
  await seedSocio('Ido', { uid: 'u-ido', bajaAt: new Date('2026-01-01') });
});

afterAll(() => {
  ft.cleanup();
});

describe('sendGroupMessage', () => {
  it('reaches every active socio once per account, by every channel they have', async () => {
    const result = await runSendGroupMessage(db(), 'u-luis', input(), NOW);
    expect(result).toEqual({ messageId: 'Msg0000000001', recipientCount: 4, pushCount: 2, emailCount: 3, whatsappCount: 1 });

    const message = (await db().doc(`organizations/${ORG_ID}/messages/Msg0000000001`).get()).data();
    expect(message).toMatchObject({
      title: 'Asamblea', pinned: true, signerName: 'Luis', signerTitle: 'presidente', sentBy: 'u-luis',
      recipientCount: 4, emailCount: 3, whatsappCount: 1, nudgeCount: 0, lastNudgedAt: null,
      audience: { kind: 'all', eventId: null, eventTitle: null },
    });
    expect([...(message?.['recipientUids'] as string[])].sort()).toEqual(['u-eva', 'u-luis', 'u-paco']);

    const rows = await deliveries();
    expect(Object.keys(rows).sort()).toEqual(['typed_Pepa', 'u-eva', 'u-luis', 'u-paco']);
    // Paco hears once, about himself and the persona he answers for.
    expect(rows['u-paco']).toMatchObject({ push: true, email: 'sent', whatsappSocioId: null });
    expect([...(rows['u-paco']['socioIds'] as string[])].sort()).toEqual(['Nene', 'Paco']);
    // The sender has the message already: no buzz for him.
    expect(rows['u-luis']).toMatchObject({ push: false, email: 'sent' });
    // Pepa has neither the app nor an email: WhatsApp is her fallback.
    expect(rows['typed_Pepa']).toMatchObject({ uid: null, push: false, email: null, whatsappSocioId: 'Pepa', whatsappSentAt: null });

    expect(await notificationsOf('u-luis')).toEqual([]);
    const [paco] = await notificationsOf('u-paco');
    expect(paco).toMatchObject({ id: 'group_message_Msg0000000001', type: 'group_message', entityKind: 'organization', entityId: ORG_ID, title: 'La Anduela · Asamblea' });
    expect(await notificationsOf('u-ido')).toEqual([]);

    const emails = sendEmailBatchMock.mock.calls[0]?.[0] as { to: string; fromName: string; text: string; replyTo?: string }[];
    expect(emails.map((e) => e.to).sort()).toEqual(['paco@compartido.es', 'u-eva@x.es', 'u-luis@x.es']);
    expect(emails[0]?.fromName).toBe('La Anduela');
    expect(emails[0]?.text).toContain('Luis\nPresidencia · La Anduela');
    // A reply reaches the admin who wrote it.
    expect(new Set(emails.map((e) => e.replyTo))).toEqual(new Set(['u-luis@x.es']));
    // No placeholders, nothing personal stored.
    expect(rows['u-paco']).toMatchObject({ personal: null });
  });

  it('links each email to the aviso, not just the group', async () => {
    await runSendGroupMessage(db(), 'u-luis', input(), NOW);
    const emails = sendEmailBatchMock.mock.calls[0]?.[0] as { text: string }[];
    expect(emails[0]?.text).toContain(`/grupos?grupo=${ORG_ID}&aviso=Msg0000000001`);
  });

  it('leaves the default Reply-To when the sending admin has no address', async () => {
    await db().doc('users/u-luis').update({ email: '' });
    await runSendGroupMessage(db(), 'u-luis', input(), NOW);
    const emails = sendEmailBatchMock.mock.calls[0]?.[0] as { replyTo?: string }[];
    expect(emails.every((e) => e.replyTo === undefined)).toBe(true);
  });

  describe('placeholders', () => {
    const PERSONAL = {
      title: 'Hola {nombre}',
      body: 'Hola {nombre},\n\nEl sábado hay asamblea.\n\nTu nº de socio es el {nº socio}.\nTienes pendiente {cuota pendiente}.',
    };
    const emailTo = (to: string) =>
      (sendEmailBatchMock.mock.calls[0]?.[0] as { to: string; subject: string; text: string }[]).find((e) => e.to === to);

    beforeEach(async () => {
      await db().doc(`organizations/${ORG_ID}/cuotaSettings/current`).set({
        amountCents: 3000, periodicity: 'yearly', dueMonth: 1, dueDay: 1, graceDays: 30, startPeriod: '2020', tiers: [],
        bizum: null, iban: null, payInstructions: null, remindersEnabled: false, configuredBy: 'u-luis', updatedAt: new Date(),
      });
      await db().doc(`organizations/${ORG_ID}/socios/Paco`).update({ socioNumber: 57 });
      await db().doc(`organizations/${ORG_ID}/socios/Pepa`).update({ socioNumber: 58 });
    });

    it('a household hears as its holder: own name and number, what it all owes', async () => {
      await runSendGroupMessage(db(), 'u-luis', input(PERSONAL), NOW);
      const paco = emailTo('paco@compartido.es');
      expect(paco?.subject).toBe('Hola Paco · La Anduela');
      expect(paco?.text).toContain('Hola Paco,');
      expect(paco?.text).toContain('Tu nº de socio es el 57.');
      // Paco's cuota and his persona's, the base amount each.
      expect(paco?.text).toMatch(/Tienes pendiente 60,00\s€\./);

      const rows = await deliveries();
      expect(rows['u-paco']['personal']).toEqual({ nombre: 'Paco', numero: 57, cuotaCents: 6000 });
      // The WhatsApp link is built later, from these stored values.
      expect(rows['typed_Pepa']['personal']).toEqual({ nombre: 'Pepa', numero: 58, cuotaCents: 3000 });

      const [notice] = await notificationsOf('u-paco');
      expect(notice).toMatchObject({ title: 'La Anduela · Hola Paco' });
      expect(String(notice['body'])).toContain('Hola Paco,');
    });

    it('someone without a number or a debt loses just those lines', async () => {
      await db().doc(`organizations/${ORG_ID}/cuotaAssignments/Eva`).set({ tierId: null, exempt: true, customAmountCents: null, updatedBy: 'u-luis', updatedAt: new Date() });
      await runSendGroupMessage(db(), 'u-luis', input(PERSONAL), NOW);
      const eva = emailTo('u-eva@x.es');
      expect(eva?.text).toContain('Hola Eva,');
      expect(eva?.text).not.toContain('nº de socio');
      expect(eva?.text).not.toContain('pendiente');
    });

    it('keeps the placeholders on the stored message, the history', async () => {
      await runSendGroupMessage(db(), 'u-luis', input(PERSONAL), NOW);
      const message = (await db().doc(`organizations/${ORG_ID}/messages/Msg0000000001`).get()).data();
      expect(message?.['title']).toBe('Hola {nombre}');
      expect(String(message?.['body'])).toContain('{cuota pendiente}');
    });

    it('a member with no socio row of their own gets their account name', async () => {
      await seedUser('u-visit');
      await db().doc('users/u-visit').update({ displayName: 'Visitante' });
      await db().doc('events/e-1').set(
        buildEventData({
          title: 'Cena', description: '', startDate: new Date('2026-11-01T18:00:00Z'), location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'local' },
          organizerUserIds: ['u-luis'], organizerOrgIds: [ORG_ID], createdBy: 'u-luis', municipalityId: 'mun-1', villageName: 'Villa', villageSlug: 'villa',
          villageCoordinates: null,
        }),
      );
      await db().doc('events/e-1/registrations/r-1').set(
        buildRegistrationData({ userId: 'u-visit', personId: 'p-hijo', name: 'Hijo de Visitante', status: 'confirmed', position: 1, isMember: true }),
      );
      await runSendGroupMessage(db(), 'u-luis', input({ ...PERSONAL, audience: { kind: 'event', eventId: 'e-1' } }), NOW);
      expect(emailTo('u-visit@x.es')?.subject).toBe('Hola Visitante · La Anduela');
    });
  });

  it('sends nothing twice for a retried call', async () => {
    await runSendGroupMessage(db(), 'u-luis', input(), NOW);
    const again = await runSendGroupMessage(db(), 'u-luis', input({ title: 'Otro' }), NOW);
    expect(again.recipientCount).toBe(4);
    expect(sendEmailBatchMock).toHaveBeenCalledTimes(1);
    expect((await db().doc(`organizations/${ORG_ID}/messages/Msg0000000001`).get()).data()?.['title']).toBe('Asamblea');
  });

  it('the junta audience reaches only the admins', async () => {
    const result = await runSendGroupMessage(db(), 'u-luis', input({ audience: { kind: 'junta', eventId: null } }), NOW);
    expect(result.recipientCount).toBe(2);
    expect(Object.keys(await deliveries()).sort()).toEqual(['u-eva', 'u-luis']);
  });

  it('the cuota audience reaches those whose cuota is pendiente or vencida', async () => {
    await db().doc(`organizations/${ORG_ID}/cuotaSettings/current`).set({
      amountCents: 3000, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 30, startPeriod: '2026', tiers: [],
      bizum: null, iban: null, payInstructions: null, remindersEnabled: false, configuredBy: 'u-luis', updatedAt: new Date(),
    });
    for (const socioId of ['Luis', 'Eva', 'Nene', 'Pepa']) {
      await db().doc(`organizations/${ORG_ID}/cuotaPayments/paid-${socioId}`).set({
        socioId, periodKey: '2026', kind: 'payment', reversesId: null, amountCents: 3000, method: 'efectivo',
        paidOn: '2026-01-10', note: null, recordedBy: 'u-luis', recordedAt: new Date(),
      });
    }
    const result = await runSendGroupMessage(db(), 'u-luis', input({ audience: { kind: 'cuota', eventId: null } }), NOW);
    expect(result.recipientCount).toBe(1);
    expect(await deliveries()).toMatchObject({ 'u-paco': { socioIds: ['Paco'] } });
  });

  it('the cuota audience needs a cuota', async () => {
    await expect(runSendGroupMessage(db(), 'u-luis', input({ audience: { kind: 'cuota', eventId: null } }), NOW)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('the event audience reaches each registrant account once, and only for the group’s own events', async () => {
    const event = (title: string, orgId: string) =>
      buildEventData({
        title, description: '', startDate: new Date('2026-11-01T18:00:00Z'), location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'local' },
        organizerUserIds: ['u-luis'], organizerOrgIds: [orgId], createdBy: 'u-luis', municipalityId: 'mun-1', villageName: 'Villa', villageSlug: 'villa',
        villageCoordinates: null,
      });
    // Raw writes: the test's firebase-admin is not the converter's, so its GeoPoint would not serialize.
    await db().doc('events/ev-1').set(event('Cena de socios', ORG_ID));
    await db().doc('events/ev-other').set(event('Otra', 'org-2'));
    const reg = (userId: string, name: string) =>
      buildRegistrationData({ userId, personId: `p-${name}`, name, status: 'confirmed', position: 1, isMember: true });
    await db().doc('events/ev-1/registrations/r1').set(reg('u-paco', 'Paco'));
    await db().doc('events/ev-1/registrations/r2').set(reg('u-paco', 'Nene'));
    await db().doc('events/ev-1/registrations/r3').set(reg('u-visit', 'Visitante'));
    await seedUser('u-visit');

    const result = await runSendGroupMessage(db(), 'u-luis', input({ audience: { kind: 'event', eventId: 'ev-1' } }), NOW);
    expect(result.recipientCount).toBe(2);
    const rows = await deliveries();
    expect(rows['u-paco']).toMatchObject({ names: ['Paco', 'Nene'], socioIds: ['Paco'] });
    // Not a socio: reached in the app and at the account's own address, never by WhatsApp.
    expect(rows['u-visit']).toMatchObject({ socioIds: [], push: true, email: 'sent', whatsappSocioId: null });
    expect((await db().doc(`organizations/${ORG_ID}/messages/Msg0000000001`).get()).data()?.['audience']).toEqual({
      kind: 'event', eventId: 'ev-1', eventTitle: 'Cena de socios',
    });

    await expect(
      runSendGroupMessage(db(), 'u-luis', input({ messageId: 'Msg0000000002', audience: { kind: 'event', eventId: 'ev-other' } }), NOW),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('WhatsApp to everyone with a phone, and none when switched off', async () => {
    await runSendGroupMessage(db(), 'u-luis', input({ channels: { push: true, email: false, whatsapp: 'all' } }), NOW);
    const rows = await deliveries();
    expect(rows['u-paco']).toMatchObject({ whatsappSocioId: 'Paco', email: null });
    expect(rows['typed_Pepa']).toMatchObject({ whatsappSocioId: 'Pepa' });
    expect(sendEmailBatchMock.mock.calls[0]?.[0]).toEqual([]);

    await runSendGroupMessage(db(), 'u-luis', input({ messageId: 'Msg0000000002', channels: { push: true, email: true, whatsapp: 'none' } }), NOW);
    expect((await deliveries('Msg0000000002'))['typed_Pepa']).toMatchObject({ whatsappSocioId: null });
  });

  it('records an email the transport could not deliver', async () => {
    sendEmailBatchMock.mockImplementationOnce((emails: unknown[]) => Promise.resolve(emails.map(() => 'failed' as const)));
    const result = await runSendGroupMessage(db(), 'u-luis', input(), NOW);
    expect(result.emailCount).toBe(0);
    expect((await deliveries())['u-paco']).toMatchObject({ email: 'failed' });
  });

  it('only an admin sends, only from a group with a roster', async () => {
    await expect(runSendGroupMessage(db(), 'u-paco', input(), NOW)).rejects.toMatchObject({ code: 'permission-denied' });
    await seedOrg('ayuntamiento');
    await expect(runSendGroupMessage(db(), 'u-luis', input(), NOW)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('the callable refuses the unauthenticated and a malformed message', async () => {
    const wrapped = ft.wrap(sendGroupMessage as unknown as Parameters<typeof ft.wrap>[0]);
    const call = (uid: string | null, data: unknown) =>
      wrapped({ data, auth: uid ? { uid, token: {} } : undefined } as unknown as Parameters<typeof wrapped>[0]);
    await expect(call(null, input())).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call('u-luis', { ...input(), title: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('nudgeGroupMessage', () => {
  it('pushes again only to the unread, then makes the admin wait', async () => {
    await runSendGroupMessage(db(), 'u-luis', input(), NOW);
    await db().doc(`organizations/${ORG_ID}/messages/Msg0000000001/reads/u-eva`).set({ readAt: new Date() });

    const result = await runNudgeGroupMessage(db(), 'u-eva', ORG_ID, 'Msg0000000001', NOW);
    expect(result).toEqual({ nudged: 1 });
    expect((await notificationsOf('u-paco')).map((n) => n.id).sort()).toEqual(['group_message_Msg0000000001', 'group_message_Msg0000000001_nudge1']);
    expect((await notificationsOf('u-eva')).map((n) => n.id)).toEqual(['group_message_Msg0000000001']);
    expect(await notificationsOf('u-luis')).toEqual([]);

    await expect(runNudgeGroupMessage(db(), 'u-eva', ORG_ID, 'Msg0000000001', new Date(NOW.getTime() + 60_000))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    const later = new Date(NOW.getTime() + 13 * 60 * 60 * 1000);
    expect(await runNudgeGroupMessage(db(), 'u-eva', ORG_ID, 'Msg0000000001', later)).toEqual({ nudged: 1 });
    expect((await notificationsOf('u-paco')).map((n) => n.id)).toContain('group_message_Msg0000000001_nudge2');
  });

  it('is for admins only', async () => {
    await runSendGroupMessage(db(), 'u-luis', input(), NOW);
    await expect(runNudgeGroupMessage(db(), 'u-paco', ORG_ID, 'Msg0000000001', NOW)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
