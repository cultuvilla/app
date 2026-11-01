// Handler tests for the scheduled cuota reminders, against the Firestore emulator.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as admin from 'firebase-admin';
import { resetEmulators } from '../../helpers/firestoreEmulator';

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn(() => Promise.resolve('sent' as const)) }));
vi.mock('../../../shared/email', () => ({ sendEmail: sendEmailMock }));

import { runCuotaReminders, sendCuotaReminders } from '../../../organizations/sendCuotaReminders';

const ORG_ID = 'org-1';
const db = () => admin.firestore();
// 10:00 Madrid on 25 February 2026: the week before a 1 March due date.
const BEFORE = new Date('2026-02-25T09:00:00Z');
// 1 April 2026: past the 30-day grace.
const AFTER = new Date('2026-04-01T08:00:00Z');

async function seedOrg(type = 'asociación') {
  await db().doc(`organizations/${ORG_ID}`).set({
    name: 'La Anduela', description: null, images: [], type, status: 'approved', municipalityId: 'mun-1',
    villageSlug: 'villa', requestedBy: 'founder', reviewedBy: null, createdAt: new Date(), reviewedAt: null,
    commentCount: 0, readCount: 0, memberCount: 0, membersPublic: true, joinPolicy: 'open', sociosListVisible: false,
  });
}

async function seedSettings(overrides: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}/cuotaSettings/current`).set({
    amountCents: 3000, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 30, startPeriod: '2026',
    tiers: [{ id: 'fam', name: 'Familiar', amountCents: 5000, coversPersonas: true }],
    bizum: '600111222', iban: null, payInstructions: null, remindersEnabled: true,
    configuredBy: 'u-eva', updatedAt: new Date(), ...overrides,
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

async function notificationsOf(uid: string) {
  return (await db().collection(`users/${uid}/notifications`).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
}

async function reminders() {
  return (await db().collection(`organizations/${ORG_ID}/cuotaReminders`).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
}

beforeEach(async () => {
  await resetEmulators();
  sendEmailMock.mockClear();
  await seedOrg();
  await seedMember('u-luis', 'Luis', 'admin', { adminTitle: 'tesorero' });
  await seedMember('u-eva', 'Eva', 'admin');
  // The admins are paid up, so only the socios under test are reminded.
  for (const socioId of ['Luis', 'Eva']) {
    await db().doc(`organizations/${ORG_ID}/cuotaPayments/paid-${socioId}`).set({
      socioId, periodKey: '2026', kind: 'payment', reversesId: null, amountCents: 3000, method: 'efectivo',
      paidOn: '2026-01-10', note: null, recordedBy: 'u-luis', recordedAt: new Date(),
    });
  }
});

describe('sendCuotaReminders', () => {
  it('runs daily at 10:00 Madrid, out of quiet hours', () => {
    const schedule = (sendCuotaReminders as unknown as { __endpoint: { scheduleTrigger: { schedule: string; timeZone: string } } })
      .__endpoint.scheduleTrigger;
    expect(schedule).toMatchObject({ schedule: 'every day 10:00', timeZone: 'Europe/Madrid' });
  });

  it('reminds an unpaid member in the week before, by push and email, signed by the tesorero — once', async () => {
    await seedSettings();
    await seedMember('u-ana', 'Ana');

    const first = await runCuotaReminders(db(), BEFORE);
    expect(first).toMatchObject({ reminderCount: 1, pushCount: 1, emailCount: 1 });

    const [n, ...rest] = await notificationsOf('u-ana');
    expect(rest).toHaveLength(0);
    expect(n).toMatchObject({ type: 'cuota_reminder', entityKind: 'organization', entityId: ORG_ID, municipalityId: 'mun-1' });
    expect(String(n['title'])).toBe('Cuota 2026 · La Anduela');
    expect(String(n['body'])).toMatch(/^Luis: tu cuota \(30,00\s€\) vence el domingo, 1 de marzo de 2026\.$/);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [email] = sendEmailMock.mock.calls[0] as unknown as [{ to: string; text: string; fromName: string }];
    expect(email.to).toBe('u-ana@x.es');
    expect(email.fromName).toBe('La Anduela (vía Cultuvilla)');
    expect(email.text).toContain('Bizum: 600111222');
    expect(email.text).toContain('Luis\nTesorería · La Anduela');

    expect(await reminders()).toEqual([
      expect.objectContaining({ id: '2026_before_Ana', socioId: 'Ana', stage: 'before', recipientUid: 'u-ana', push: true, email: true, signerName: 'Luis' }),
    ]);

    const second = await runCuotaReminders(db(), BEFORE);
    expect(second.reminderCount).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('prefers the address the socio shared with the junta', async () => {
    await seedSettings();
    await seedMember('u-ana', 'Ana');
    await db().doc(`organizations/${ORG_ID}/socioPrivate/Ana`).set({ phone: null, email: 'ana@junta.es', consentAnsweredAt: new Date() });
    await runCuotaReminders(db(), BEFORE);
    expect((sendEmailMock.mock.calls[0] as unknown as [{ to: string }])[0].to).toBe('ana@junta.es');
  });

  it('sends the "after" reminder once vencida', async () => {
    await seedSettings();
    await seedMember('u-ana', 'Ana');
    await runCuotaReminders(db(), AFTER);
    expect((await reminders()).map((r) => r['id'])).toEqual(['2026_after_Ana']);
    expect(String((await notificationsOf('u-ana'))[0]?.['body'])).toContain('venció el');
  });

  it('a persona a cargo reminds its responsible member, in one message with theirs', async () => {
    await seedSettings();
    await seedMember('u-ana', 'Ana');
    await seedSocio('Nene', { kind: 'persona', responsibleUid: 'u-ana', personId: 'kid' });

    await runCuotaReminders(db(), BEFORE);

    const notifications = await notificationsOf('u-ana');
    expect(notifications).toHaveLength(1);
    expect(String(notifications[0]?.['body'])).toMatch(/la cuota de Ana, Nene \(60,00\s€\)/);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect((await reminders()).map((r) => r['id']).sort()).toEqual(['2026_before_Ana', '2026_before_Nene']);
  });

  it('on a family tier only the member is reminded, for the household amount', async () => {
    await seedSettings();
    await seedMember('u-ana', 'Ana');
    await seedSocio('Nene', { kind: 'persona', responsibleUid: 'u-ana', personId: 'kid' });
    await db().doc(`organizations/${ORG_ID}/cuotaAssignments/Ana`).set({
      tierId: 'fam', exempt: false, customAmountCents: null, updatedBy: 'u-luis', updatedAt: new Date(),
    });
    await runCuotaReminders(db(), BEFORE);
    expect(String((await notificationsOf('u-ana'))[0]?.['body'])).toMatch(/tu cuota \(50,00\s€\)/);
    expect((await reminders()).map((r) => r['id'])).toEqual(['2026_before_Ana']);
  });

  it('a typed socio is emailed only when the junta has an address; never pushed', async () => {
    await seedSettings();
    await seedSocio('Benito', { kind: 'typed' });
    await seedSocio('Sinmail', { kind: 'typed' });
    await db().doc(`organizations/${ORG_ID}/socioPrivate/Benito`).set({ phone: null, email: 'benito@x.es', consentAnsweredAt: null });

    await runCuotaReminders(db(), BEFORE);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect((sendEmailMock.mock.calls[0] as unknown as [{ to: string }])[0].to).toBe('benito@x.es');
    expect(await reminders()).toEqual([expect.objectContaining({ id: '2026_before_Benito', push: false, email: true, recipientUid: null })]);
  });

  it('reminds nobody who is al día, a baja, or in a group with reminders off', async () => {
    await seedSettings();
    await seedMember('u-ana', 'Ana');
    await seedSocio('Gone', { kind: 'typed', bajaAt: new Date('2026-02-01T10:00:00Z') });
    await db().doc(`organizations/${ORG_ID}/socioPrivate/Gone`).set({ phone: null, email: 'gone@x.es', consentAnsweredAt: null });
    await db().doc(`organizations/${ORG_ID}/cuotaPayments/p-ana`).set({
      socioId: 'Ana', periodKey: '2026', kind: 'payment', reversesId: null, amountCents: 3000, method: 'bizum',
      paidOn: '2026-02-20', note: null, recordedBy: 'u-luis', recordedAt: new Date(),
    });
    await runCuotaReminders(db(), BEFORE);
    expect(await reminders()).toEqual([]);

    await db().doc(`organizations/${ORG_ID}/cuotaPayments/p-ana`).delete();
    await seedSettings({ remindersEnabled: false });
    expect((await runCuotaReminders(db(), AFTER)).reminderCount).toBe(0);
  });

  it('signs with the admin who configured the cuota when nobody is tesorero', async () => {
    await seedSettings();
    await db().doc(`organizations/${ORG_ID}/socios/Luis`).update({ adminTitle: null });
    await seedMember('u-ana', 'Ana');
    await runCuotaReminders(db(), BEFORE);
    expect(String((await notificationsOf('u-ana'))[0]?.['body'])).toMatch(/^Eva: /);
  });
});
