// packages/shared/test/e2e/recordsRules.test.ts
// The group's records: actas (admins write, socios read the shared ones) and
// the income/expense ledger (admins only, append-only).
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

function acta(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    body: 'asamblea_general', title: null, heldOn: '2026-03-15', place: 'Local', attendees: [{ socioId: 'm1', name: 'Ana' }],
    otherAttendees: 0, agenda: ['Cuentas'], agreements: ['Se aprueban'], visibleToSocios: false,
    createdBy: uid, createdAt: serverTimestamp(), updatedBy: uid, updatedAt: serverTimestamp(), ...overrides,
  };
}

function entry(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'expense', amountCents: 12000, on: '2026-08-01', concept: 'Orquesta', category: 'Fiestas', reversesId: null,
    recordedBy: uid, recordedAt: serverTimestamp(), ...overrides,
  };
}

async function seed() {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const org = { name: 'Asociación', type: 'asociación', status: 'approved', municipalityId: 'mun1' };
    await setDoc(doc(db, `organizations/${ORG}`), org);
    await setDoc(doc(db, `organizations/${AYTO}`), { ...org, type: 'ayuntamiento' });
    for (const [uid, role] of [['admin1', 'admin'], ['admin2', 'admin'], ['member1', 'member']]) {
      await setDoc(doc(db, `organizations/${ORG}/members/${uid}`), { userId: uid, joinedAt: new Date(), role });
    }
    await setDoc(doc(db, `organizations/${AYTO}/members/admin1`), { userId: 'admin1', joinedAt: new Date(), role: 'admin' });
    const stamped = { createdAt: new Date(), updatedAt: new Date() };
    await setDoc(doc(db, `organizations/${ORG}/actas/hidden`), { ...acta('admin1'), ...stamped });
    await setDoc(doc(db, `organizations/${ORG}/actas/shared`), { ...acta('admin1', { visibleToSocios: true }), ...stamped });
    await setDoc(doc(db, `organizations/${ORG}/ledgerEntries/e1`), { ...entry('admin1'), recordedAt: new Date() });
  });
}

beforeEach(async () => {
  await seed();
});

describe('actas', () => {
  it('an admin writes an acta, signed by themself and stamped by the server', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG}/actas/new1`), acta('admin1')));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/actas/new2`), acta('admin2')));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/actas/new3`), acta('admin1', { createdAt: new Date() })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/actas/new4`), acta('admin1', { body: 'pleno' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/actas/new5`), acta('admin1', { heldOn: '15/03/2026' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/actas/new6`), acta('admin1', { extra: true })));
  });

  it('a member cannot write one, and the ayuntamiento keeps none', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/actas/x`), acta('member1')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${AYTO}/actas/x`), acta('admin1')));
  });

  it('another admin corrects an acta and shares it, but cannot rewrite who wrote it', async () => {
    const db = asUser(getEnv(), 'admin2');
    const ref = doc(db, `organizations/${ORG}/actas/hidden`);
    await assertSucceeds(updateDoc(ref, { visibleToSocios: true, agreements: ['Otro'], updatedBy: 'admin2', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdBy: 'admin2', updatedBy: 'admin2', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { place: 'Bar', updatedBy: 'admin1', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/actas/shared`), { place: 'Bar', updatedBy: 'member1', updatedAt: serverTimestamp() }));
  });

  it('admins read every acta; a member only the shared ones, by asking for them', async () => {
    const admin = asUser(getEnv(), 'admin1');
    await assertSucceeds(getDocs(collection(admin, `organizations/${ORG}/actas`)));
    const member = asUser(getEnv(), 'member1');
    await assertSucceeds(getDocs(query(collection(member, `organizations/${ORG}/actas`), where('visibleToSocios', '==', true))));
    await assertSucceeds(getDoc(doc(member, `organizations/${ORG}/actas/shared`)));
    await assertFails(getDoc(doc(member, `organizations/${ORG}/actas/hidden`)));
    await assertFails(getDocs(collection(member, `organizations/${ORG}/actas`)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'stranger'), `organizations/${ORG}/actas/shared`)));
  });

  it('an admin deletes an acta; a member cannot', async () => {
    await assertFails(deleteDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/actas/shared`)));
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/actas/shared`)));
  });
});

describe('ledgerEntries', () => {
  it('an admin records an entry; a member cannot, nor can the ayuntamiento keep one', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/n1`), entry('admin1')));
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/n2`), entry('admin1', { kind: 'income', category: null })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/n3`), entry('admin1', { amountCents: 0 })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/n4`), entry('admin1', { kind: 'gift' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/n5`), entry('admin2')));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/n6`), entry('admin1', { concept: '' })));
    await assertFails(setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/ledgerEntries/n7`), entry('member1')));
    await assertFails(setDoc(doc(db, `organizations/${AYTO}/ledgerEntries/n8`), entry('admin1')));
  });

  it('is append-only: no edit, no delete', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertFails(updateDoc(doc(db, `organizations/${ORG}/ledgerEntries/e1`), { amountCents: 1 }));
    await assertFails(deleteDoc(doc(db, `organizations/${ORG}/ledgerEntries/e1`)));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/e1`), entry('admin1', { amountCents: 1 })));
  });

  it('an entry is reversed once, by a copy at rev_<id>; a reversal is never reversed', async () => {
    const db = asUser(getEnv(), 'admin2');
    const reversal = (overrides: Record<string, unknown> = {}) => entry('admin2', { reversesId: 'e1', ...overrides });
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/rev_other`), reversal()));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/rev_e1`), reversal({ amountCents: 1 })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/rev_e1`), reversal({ kind: 'income' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/rev_e1`), reversal({ on: '2026-08-02' })));
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/rev_e1`), reversal()));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/rev_e1`), reversal({ concept: 'again' })));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/ledgerEntries/rev_rev_e1`), reversal({ reversesId: 'rev_e1' })));
  });

  it('only admins read the ledger', async () => {
    const range = (uid: string) =>
      getDocs(query(collection(asUser(getEnv(), uid), `organizations/${ORG}/ledgerEntries`), where('on', '>=', '2026-01-01'), where('on', '<=', '2026-12-31')));
    await assertSucceeds(range('admin1'));
    await assertFails(range('member1'));
  });
});
