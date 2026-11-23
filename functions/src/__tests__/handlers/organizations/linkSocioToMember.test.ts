// Handler test for the linkSocioToMember callable.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { linkSocioToMember } from '../../../organizations/linkSocioToMember';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG_ID = 'org-1';
const PACO_JOINED = new Date('2026-10-01T09:00:00Z');

function socioRow(overrides: Record<string, unknown>) {
  return {
    kind: 'typed', socioNumber: null, displayName: 'Paco', uid: null, personId: null, responsibleUid: null, adminTitle: null,
    altaAt: new Date('2024-01-01'), bajaAt: null, memberJoinedAt: null, createdBy: 'admin', ...overrides,
  };
}

async function seed() {
  const db = admin.firestore();
  await db.doc(`organizations/${ORG_ID}/members/admin`).set({ userId: 'admin', joinedAt: new Date(), role: 'admin' });
  await db.doc(`organizations/${ORG_ID}/members/paco`).set({ userId: 'paco', joinedAt: PACO_JOINED, role: 'member' });
  await db.doc(`organizations/${ORG_ID}/socios/typed`).set(socioRow({}));
  await db.doc(`organizations/${ORG_ID}/socioPrivate/typed`).set({ phone: '600', email: null, consentAnsweredAt: null });
  await db.doc(`organizations/${ORG_ID}/socios/dup`).set(
    socioRow({ kind: 'member', displayName: 'Francisco Pérez', uid: 'paco', personId: 'person-paco', altaAt: new Date('2026-10-01'), createdBy: 'paco' }),
  );
}

function call(uid: string | null, data: unknown) {
  const wrapped = ft.wrap(linkSocioToMember as unknown as Parameters<typeof ft.wrap>[0]);
  return wrapped({ data, auth: uid ? { uid, token: {} } : undefined } as unknown as Parameters<typeof wrapped>[0]);
}

beforeEach(async () => {
  await resetEmulators();
  await seed();
});

afterAll(() => {
  ft.cleanup();
});

describe('linkSocioToMember (callable)', () => {
  it('merges the member row into the typed row, keeping the earlier alta', async () => {
    await call('admin', { orgId: ORG_ID, socioId: 'typed', memberUid: 'paco' });
    const db = admin.firestore();
    const typed = (await db.doc(`organizations/${ORG_ID}/socios/typed`).get()).data();
    expect(typed).toMatchObject({ kind: 'member', uid: 'paco', personId: 'person-paco', displayName: 'Francisco Pérez', bajaAt: null });
    expect((typed?.altaAt as admin.firestore.Timestamp).toDate()).toEqual(new Date('2024-01-01'));
    expect((typed?.memberJoinedAt as admin.firestore.Timestamp).toDate()).toEqual(PACO_JOINED);
    expect((await db.doc(`organizations/${ORG_ID}/socios/dup`).get()).exists).toBe(false);
    expect((await db.doc(`organizations/${ORG_ID}/socioPrivate/typed`).get()).data()?.phone).toBe('600');
  });

  it("keeps the typed row's socio number, else takes the member row's", async () => {
    const db = admin.firestore();
    await db.doc(`organizations/${ORG_ID}/socios/typed`).update({ socioNumber: 57 });
    await db.doc(`organizations/${ORG_ID}/socios/dup`).update({ socioNumber: 210 });
    await call('admin', { orgId: ORG_ID, socioId: 'typed', memberUid: 'paco' });
    expect((await db.doc(`organizations/${ORG_ID}/socios/typed`).get()).get('socioNumber')).toBe(57);
  });

  it('a typed row without a number takes the member row’s', async () => {
    const db = admin.firestore();
    await db.doc(`organizations/${ORG_ID}/socios/dup`).update({ socioNumber: 210 });
    await call('admin', { orgId: ORG_ID, socioId: 'typed', memberUid: 'paco' });
    expect((await db.doc(`organizations/${ORG_ID}/socios/typed`).get()).get('socioNumber')).toBe(210);
  });

  it("the member's own consent answer replaces the typed contact", async () => {
    await admin.firestore().doc(`organizations/${ORG_ID}/socioPrivate/dup`).set({
      phone: null, email: 'paco@x.es', consentAnsweredAt: new Date(),
    });
    await call('admin', { orgId: ORG_ID, socioId: 'typed', memberUid: 'paco' });
    const priv = (await admin.firestore().doc(`organizations/${ORG_ID}/socioPrivate/typed`).get()).data();
    expect(priv).toMatchObject({ phone: null, email: 'paco@x.es' });
  });

  it('moves the cuota entries and assignment of the deleted row onto the surviving one', async () => {
    const db = admin.firestore();
    const entry = {
      periodKey: '2026', kind: 'payment', reversesId: null, amountCents: 3000, method: 'bizum',
      paidOn: '2026-02-20', note: null, recordedBy: 'admin', recordedAt: new Date(),
    };
    await db.doc(`organizations/${ORG_ID}/cuotaPayments/pay1`).set({ ...entry, socioId: 'dup' });
    await db.doc(`organizations/${ORG_ID}/cuotaPayments/pay2`).set({ ...entry, socioId: 'typed' });
    await db.doc(`organizations/${ORG_ID}/cuotaAssignments/dup`).set({
      tierId: 'fam', exempt: false, customAmountCents: null, updatedBy: 'admin', updatedAt: new Date(),
    });

    await call('admin', { orgId: ORG_ID, socioId: 'typed', memberUid: 'paco' });

    expect((await db.doc(`organizations/${ORG_ID}/cuotaPayments/pay1`).get()).data()?.socioId).toBe('typed');
    expect((await db.doc(`organizations/${ORG_ID}/cuotaPayments/pay2`).get()).data()?.socioId).toBe('typed');
    expect((await db.doc(`organizations/${ORG_ID}/cuotaAssignments/typed`).get()).data()?.tierId).toBe('fam');
    expect((await db.doc(`organizations/${ORG_ID}/cuotaAssignments/dup`).get()).exists).toBe(false);
  });

  it("keeps the typed row's own assignment over the deleted row's", async () => {
    const db = admin.firestore();
    const assignment = (tierId: string) => ({ tierId, exempt: false, customAmountCents: null, updatedBy: 'admin', updatedAt: new Date() });
    await db.doc(`organizations/${ORG_ID}/cuotaAssignments/typed`).set(assignment('jub'));
    await db.doc(`organizations/${ORG_ID}/cuotaAssignments/dup`).set(assignment('fam'));
    await call('admin', { orgId: ORG_ID, socioId: 'typed', memberUid: 'paco' });
    expect((await db.doc(`organizations/${ORG_ID}/cuotaAssignments/typed`).get()).data()?.tierId).toBe('jub');
  });

  it('refuses a caller who is not an org admin', async () => {
    await expect(call('paco', { orgId: ORG_ID, socioId: 'typed', memberUid: 'paco' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses to link to someone who is not a member', async () => {
    await expect(call('admin', { orgId: ORG_ID, socioId: 'typed', memberUid: 'stranger' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses a row that is not a typed-in socio', async () => {
    await expect(call('admin', { orgId: ORG_ID, socioId: 'dup', memberUid: 'paco' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses an unauthenticated caller', async () => {
    await expect(call(null, { orgId: ORG_ID, socioId: 'typed', memberUid: 'paco' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
