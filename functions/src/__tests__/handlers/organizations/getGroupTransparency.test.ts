// Handler tests for getGroupTransparency, against the Firestore emulator: what a
// junta opens to its integrantes, and every field it must never let through.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { runGetGroupTransparency } from '../../../organizations/getGroupTransparency';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG_ID = 'org-1';
const db = () => admin.firestore();
// 1 April 2026: the yearly cuota fell due on 1 March.
const NOW = new Date('2026-04-01T08:00:00Z');
const ALL_ON = { cuota: true, avisos: true, cuentas: true };

async function seedOrg(overrides: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}`).set({
    name: 'La Anduela', description: null, images: [], type: 'asociación', status: 'approved', municipalityId: 'mun-1',
    villageSlug: 'villa', requestedBy: 'founder', reviewedBy: null, createdAt: new Date(), reviewedAt: null,
    commentCount: 0, readCount: 0, memberCount: 0, membersPublic: true, joinPolicy: 'approval', sociosListVisible: false,
    ...overrides,
  });
}

async function seedSocio(id: string, overrides: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}/socios/${id}`).set({
    kind: 'member', socioNumber: null, displayName: id, uid: null, personId: null, responsibleUid: null, adminTitle: null,
    altaAt: new Date('2025-01-01T10:00:00Z'), bajaAt: null, memberJoinedAt: null, createdBy: 'x', ...overrides,
  });
}

async function seedMember(uid: string, socioId: string, role: 'admin' | 'member' = 'member') {
  await db().doc(`organizations/${ORG_ID}/members/${uid}`).set({ userId: uid, joinedAt: new Date('2025-01-01'), role });
  await seedSocio(socioId, { uid });
}

async function seedPayment(id: string, socioId: string, overrides: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}/cuotaPayments/${id}`).set({
    socioId, periodKey: '2026', kind: 'payment', reversesId: null, amountCents: 3000, method: 'bizum',
    paidOn: '2026-01-10', note: 'recibo 12', recordedBy: 'u-luis', recordedAt: new Date(), ...overrides,
  });
}

async function seedMessage(id: string, overrides: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}/messages/${id}`).set({
    title: 'Hola {nombre}', body: 'Tu cuota: {cuota}.\nNos vemos el sábado.', pinned: false, poll: null,
    audience: { kind: 'cuota', eventId: null, eventTitle: null },
    channels: { push: true, email: true, whatsapp: 'none' },
    recipientUids: ['u-ana'], recipientCount: 1, pushCount: 1, emailCount: 1, whatsappCount: 0,
    sentBy: 'u-luis', signerName: 'Luis', signerTitle: 'tesorero', sentAt: new Date('2026-03-20T10:00:00Z'),
    nudgeCount: 0, lastNudgedAt: null, ...overrides,
  });
}

beforeEach(async () => {
  await resetEmulators();
  await seedOrg({ transparency: ALL_ON });
  await seedMember('u-luis', 'Luis', 'admin');
  await seedMember('u-ana', 'Ana');
  await seedMember('u-paco', 'Paco');
  await seedSocio('Ido', { bajaAt: new Date('2026-01-02') });
  await db().doc(`organizations/${ORG_ID}/socioPrivate/Ana`).set({ phone: '600111222', email: 'ana@x.es', consentAnsweredAt: new Date() });
  await db().doc(`organizations/${ORG_ID}/cuotaSettings/current`).set({
    amountCents: 3000, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 0, startPeriod: '2026', tiers: [],
    bizum: '600999888', iban: 'ES00 1234', payInstructions: null, remindersEnabled: false, configuredBy: 'u-luis', updatedAt: new Date(),
  });
  await seedPayment('pay-luis', 'Luis');
  await seedPayment('pay-paco', 'Paco', { amountCents: 1500, method: 'efectivo', paidOn: '2026-02-01' });
});

afterAll(() => {
  ft.cleanup();
});

describe('getGroupTransparency — cuota', () => {
  it('lists the active socios with name and al día / pendiente only', async () => {
    const result = await runGetGroupTransparency(db(), 'u-ana', { orgId: ORG_ID, view: 'cuota' }, NOW);
    expect(result).toEqual({
      view: 'cuota',
      periodKey: '2026',
      socios: [
        { socioId: 'Ana', displayName: 'Ana', status: 'pendiente' },
        { socioId: 'Luis', displayName: 'Luis', status: 'al_dia' },
        // Paid half: vencida for the junta, just pendiente for everyone else.
        { socioId: 'Paco', displayName: 'Paco', status: 'pendiente' },
      ],
    });
    const raw = JSON.stringify(result);
    for (const secret of ['3000', '1500', 'bizum', 'efectivo', '2026-01-10', 'recibo', '600111222', 'ana@x.es', '600999888', 'ES00']) {
      expect(raw).not.toContain(secret);
    }
  });

  it('is empty until the cuota is configured', async () => {
    await db().doc(`organizations/${ORG_ID}/cuotaSettings/current`).delete();
    await expect(runGetGroupTransparency(db(), 'u-ana', { orgId: ORG_ID, view: 'cuota' }, NOW)).resolves.toEqual({
      view: 'cuota', periodKey: null, socios: [],
    });
  });
});

describe('getGroupTransparency — avisos', () => {
  it('returns every aviso to the junta, with neutral placeholders and the poll tally, never recipients or reads', async () => {
    await seedMessage('m1');
    await seedMessage('m2', {
      title: 'Cena', body: '¿Venís?', audience: { kind: 'junta', eventId: null, eventTitle: null }, recipientUids: ['u-luis'],
      poll: { question: '¿Cena?', kind: 'yes_no', options: ['Sí', 'No'] }, sentAt: new Date('2026-03-25T10:00:00Z'),
    });
    await db().doc(`organizations/${ORG_ID}/messages/m2/votes/u-luis`).set({ option: 0, votedAt: new Date() });
    await db().doc(`organizations/${ORG_ID}/messages/m2/votes/u-paco`).set({ option: 1, votedAt: new Date() });
    await db().doc(`organizations/${ORG_ID}/messages/m2/votes/u-ana`).set({ option: 0, votedAt: new Date() });
    await db().doc(`organizations/${ORG_ID}/messages/m1/reads/u-ana`).set({ readAt: new Date() });

    const result = await runGetGroupTransparency(db(), 'u-luis', { orgId: ORG_ID, view: 'avisos' }, NOW);
    if (result.view !== 'avisos') throw new Error('wrong view');
    expect(result.avisos.map((a) => a.id)).toEqual(['m2', 'm1']);
    expect(result.avisos[0]).toEqual({
      id: 'm2', title: 'Cena', body: '¿Venís?', audienceKind: 'junta', eventTitle: null, signerName: 'Luis', signerTitle: 'tesorero',
      sentAt: '2026-03-25T10:00:00.000Z', poll: { question: '¿Cena?', kind: 'yes_no', options: ['Sí', 'No'] }, tally: [2, 1],
    });
    expect(result.avisos[1]?.title).not.toContain('{nombre}');
    expect(result.avisos[1]?.body).not.toContain('{cuota}');
    expect(result.avisos[1]?.tally).toBeNull();
    const raw = JSON.stringify(result);
    for (const secret of ['u-ana', 'u-paco', 'recipient', 'readAt', 'votedAt', 'pushCount', 'emailCount']) {
      expect(raw).not.toContain(secret);
    }
  });
});

describe('getGroupTransparency — avisos for a socio', () => {
  it("leaves out what the junta sent only to itself, and keeps the rest with its results", async () => {
    await seedMessage('m1', { poll: { question: '¿Excursión?', kind: 'yes_no', options: ['Sí', 'No'] } });
    await seedMessage('m2', {
      title: 'Multa de Pepe', body: 'Lo hablamos', audience: { kind: 'junta', eventId: null, eventTitle: null }, recipientUids: ['u-luis'],
      sentAt: new Date('2026-03-25T10:00:00Z'),
    });
    await db().doc(`organizations/${ORG_ID}/messages/m1/votes/u-ana`).set({ option: 0, votedAt: new Date() });

    const result = await runGetGroupTransparency(db(), 'u-paco', { orgId: ORG_ID, view: 'avisos' }, NOW);
    if (result.view !== 'avisos') throw new Error('wrong view');
    expect(result.avisos.map((a) => a.id)).toEqual(['m1']);
    expect(result.avisos[0]?.tally).toEqual([1, 0]);
    expect(JSON.stringify(result)).not.toContain('Pepe');
  });
});

describe('getGroupTransparency — cuentas', () => {
  it('returns the cuota income as totals per period, net of anulaciones', async () => {
    await seedPayment('pay-ana', 'Ana', { amountCents: 3000, paidOn: '2026-03-02' });
    await seedPayment('rev_pay-ana', 'Ana', { kind: 'reversal', reversesId: 'pay-ana', amountCents: 3000, paidOn: '2026-03-03' });
    await seedPayment('pay-2025', 'Ana', { periodKey: '2025', paidOn: '2025-05-01' });
    const result = await runGetGroupTransparency(db(), 'u-ana', { orgId: ORG_ID, view: 'cuentas', year: '2026' }, NOW);
    expect(result).toEqual({ view: 'cuentas', year: '2026', cuotaByPeriod: [{ periodKey: '2026', cents: 4500 }], cuotaCents: 4500 });
    const raw = JSON.stringify(result);
    for (const secret of ['Ana', 'Paco', 'bizum', 'efectivo', '2026-01-10', 'recibo']) expect(raw).not.toContain(secret);
  });
});

describe('getGroupTransparency — who may ask', () => {
  it('refuses a member while the switch is off, each view on its own', async () => {
    await seedOrg({ transparency: { cuota: false, avisos: true, cuentas: false } });
    await expect(runGetGroupTransparency(db(), 'u-ana', { orgId: ORG_ID, view: 'cuota' }, NOW)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      runGetGroupTransparency(db(), 'u-ana', { orgId: ORG_ID, view: 'cuentas', year: '2026' }, NOW),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(runGetGroupTransparency(db(), 'u-ana', { orgId: ORG_ID, view: 'avisos' }, NOW)).resolves.toMatchObject({ view: 'avisos' });
  });

  it('is off for a group whose doc predates the switches', async () => {
    await seedOrg();
    await expect(runGetGroupTransparency(db(), 'u-ana', { orgId: ORG_ID, view: 'avisos' }, NOW)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('lets the junta read it with the switches off', async () => {
    await seedOrg();
    await expect(runGetGroupTransparency(db(), 'u-luis', { orgId: ORG_ID, view: 'cuota' }, NOW)).resolves.toMatchObject({ view: 'cuota' });
  });

  it('refuses someone outside the group, and a group without socios', async () => {
    await expect(runGetGroupTransparency(db(), 'u-stranger', { orgId: ORG_ID, view: 'avisos' }, NOW)).rejects.toMatchObject({ code: 'permission-denied' });
    await seedOrg({ type: 'ayuntamiento', transparency: ALL_ON });
    await expect(runGetGroupTransparency(db(), 'u-ana', { orgId: ORG_ID, view: 'avisos' }, NOW)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
