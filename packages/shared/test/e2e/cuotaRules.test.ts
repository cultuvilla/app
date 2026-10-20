// packages/shared/test/e2e/cuotaRules.test.ts
// The cuota de socios: who configures it, who reads what, and that the payment
// ledger is append-only.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const ORG = 'org1';
const AYTO = 'ayto1';

function socio(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'typed', displayName: 'Paco', uid: null, personId: null, responsibleUid: null, adminTitle: null,
    altaAt: new Date(), bajaAt: null, memberJoinedAt: null, createdBy: 'admin1', ...overrides,
  };
}

function settings(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    amountCents: 3000, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 30, startPeriod: '2026',
    tiers: [{ id: 'fam', name: 'Familiar', amountCents: 5000, coversPersonas: true }],
    bizum: '600111222', iban: null, payInstructions: null, remindersEnabled: false,
    configuredBy: uid, updatedAt: serverTimestamp(), ...overrides,
  };
}

function payment(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    socioId: 'm1', periodKey: '2026', kind: 'payment', reversesId: null, amountCents: 3000, method: 'bizum',
    paidOn: '2026-02-20', note: null, recordedBy: uid, recordedAt: serverTimestamp(), ...overrides,
  };
}

async function seed() {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const org = { name: 'Asociación', type: 'asociación', status: 'approved', municipalityId: 'mun1' };
    await setDoc(doc(db, `organizations/${ORG}`), org);
    await setDoc(doc(db, `organizations/${AYTO}`), { ...org, type: 'ayuntamiento' });
    for (const [uid, role] of [['admin1', 'admin'], ['member1', 'member'], ['member2', 'member']]) {
      await setDoc(doc(db, `organizations/${ORG}/members/${uid}`), { userId: uid, joinedAt: new Date(), role });
    }
    await setDoc(doc(db, `organizations/${AYTO}/members/admin1`), { userId: 'admin1', joinedAt: new Date(), role: 'admin' });
    await setDoc(doc(db, `organizations/${ORG}/socios/m1`), socio({ kind: 'member', uid: 'member1', createdBy: 'member1' }));
    await setDoc(doc(db, `organizations/${ORG}/socios/m2`), socio({ kind: 'member', uid: 'member2', createdBy: 'member2' }));
    await setDoc(doc(db, `organizations/${ORG}/socios/p1`), socio({ kind: 'persona', personId: 'kid', responsibleUid: 'member1', createdBy: 'member1' }));
    await setDoc(doc(db, `organizations/${ORG}/cuotaSettings/current`), { ...settings('admin1'), updatedAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/cuotaAssignments/m1`), { tierId: 'fam', exempt: false, customAmountCents: null, updatedBy: 'admin1', updatedAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/cuotaPayments/pm1`), { ...payment('admin1'), recordedAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/cuotaPayments/pp1`), { ...payment('admin1', { socioId: 'p1' }), recordedAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/cuotaPayments/pm2`), { ...payment('admin1', { socioId: 'm2' }), recordedAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/cuotaReminders/2026_after_m2`), { socioId: 'm2' });
  });
}

const payments = (uid: string) => collection(asUser(getEnv(), uid), `organizations/${ORG}/cuotaPayments`);

beforeEach(async () => {
  await seed();
});

describe('cuotaSettings', () => {
  it('members read the cuota and how to pay; outsiders do not', async () => {
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/cuotaSettings/current`)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'stranger'), `organizations/${ORG}/cuotaSettings/current`)));
  });

  it('an admin saves the settings, signed by themself and stamped by the server', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG}/cuotaSettings/current`), settings('admin1', { amountCents: 2500 })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaSettings/current`), settings('member1')));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaSettings/current`), settings('admin1', { updatedAt: new Date(2020, 0, 1) })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaSettings/other`), settings('admin1')));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaSettings/current`), settings('admin1', { amountCents: 30.5 })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaSettings/current`), settings('admin1', { periodicity: 'weekly' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaSettings/current`), settings('admin1', { extra: true })));
    await assertFails(deleteDoc(doc(db, `organizations/${ORG}/cuotaSettings/current`)));
  });

  it('a member cannot configure the cuota, and the ayuntamiento has none', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/cuotaSettings/current`), settings('member1')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${AYTO}/cuotaSettings/current`), settings('admin1')));
  });
});

describe('cuotaAssignments', () => {
  const assignment = (uid: string) => ({ tierId: null, exempt: true, customAmountCents: null, updatedBy: uid, updatedAt: serverTimestamp() });

  it('an admin assigns a socio; a member cannot, even their own', async () => {
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/cuotaAssignments/m2`), assignment('admin1')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/cuotaAssignments/nobody`), assignment('admin1')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/cuotaAssignments/m1`), assignment('member1')));
  });

  it('a member reads their own and their personas’ assignment, not another socio’s', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG}/cuotaAssignments/m1`)));
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG}/cuotaAssignments/p1`)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'member2'), `organizations/${ORG}/cuotaAssignments/m1`)));
  });
});

describe('cuotaPayments', () => {
  it('an admin records a payment for an existing socio', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/new1`), payment('admin1')));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/new2`), payment('admin1', { socioId: 'nobody' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/new3`), payment('admin1', { amountCents: 0 })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/new4`), payment('admin1', { method: 'tarjeta' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/new5`), payment('admin2')));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/new6`), payment('admin1', { recordedAt: new Date() })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/new7`), payment('admin1', { reversesId: 'pm1' })));
  });

  it('a member cannot record a payment, even for themself', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/cuotaPayments/self`), payment('member1')));
  });

  it('the ledger is append-only: no edit, no delete', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertFails(updateDoc(doc(db, `organizations/${ORG}/cuotaPayments/pm1`), { amountCents: 100 }));
    await assertFails(deleteDoc(doc(db, `organizations/${ORG}/cuotaPayments/pm1`)));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/pm1`), payment('admin1', { amountCents: 100 })));
  });

  it('a payment is reversed once, by an entry at rev_<id> that copies it', async () => {
    const db = asUser(getEnv(), 'admin1');
    const reversal = (overrides: Record<string, unknown> = {}) =>
      payment('admin1', { kind: 'reversal', reversesId: 'pm1', paidOn: '2026-02-21', ...overrides });
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/rev_other`), reversal()));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/rev_pm1`), reversal({ amountCents: 100 })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/rev_pm1`), reversal({ socioId: 'm2' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/rev_pm1`), reversal({ periodKey: '2027' })));
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/rev_pm1`), reversal()));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/cuotaPayments/rev_pm1`), reversal({ note: 'again' })));
    await assertFails(
      setDoc(doc(db, `organizations/${ORG}/cuotaPayments/rev_rev_pm1`), reversal({ reversesId: 'rev_pm1' })),
    );
  });

  it('a member reads the history of their own and their personas’ rows, one socio at a time', async () => {
    await assertSucceeds(getDocs(query(payments('member1'), where('socioId', '==', 'm1'))));
    await assertSucceeds(getDocs(query(payments('member1'), where('socioId', '==', 'p1'))));
    await assertFails(getDocs(query(payments('member1'), where('socioId', '==', 'm2'))));
    await assertFails(getDocs(query(payments('member1'), where('periodKey', '==', '2026'))));
    await assertFails(getDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/cuotaPayments/pm2`)));
  });

  it('an admin reads a whole period', async () => {
    await assertSucceeds(getDocs(query(payments('admin1'), where('periodKey', '==', '2026'))));
  });
});

describe('cuotaReminders', () => {
  it('admins read what was sent; nobody writes it', async () => {
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'admin1'), `organizations/${ORG}/cuotaReminders`)));
    await assertFails(getDocs(collection(asUser(getEnv(), 'member2'), `organizations/${ORG}/cuotaReminders`)));
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/cuotaReminders/x`), { socioId: 'm1' }));
  });
});
