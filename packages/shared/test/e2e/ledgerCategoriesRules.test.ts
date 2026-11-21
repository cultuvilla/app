// packages/shared/test/e2e/ledgerCategoriesRules.test.ts
// The categories admins pick from when noting a ledger entry: admins only,
// in a group with a socio roster; a rename touches only the name.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const ORG = 'org1';
const AYTO = 'ayto1';
const path = (id: string, org = ORG) => `organizations/${org}/ledgerCategories/${id}`;

function category(uid: string, overrides: Record<string, unknown> = {}) {
  return { name: 'Fiestas', kind: 'expense', createdBy: uid, createdAt: serverTimestamp(), ...overrides };
}

beforeEach(async () => {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const org = { name: 'Asociación', type: 'asociación', status: 'approved', municipalityId: 'mun1' };
    await setDoc(doc(db, `organizations/${ORG}`), org);
    await setDoc(doc(db, `organizations/${AYTO}`), { ...org, type: 'ayuntamiento' });
    for (const [uid, role] of [['admin1', 'admin'], ['member1', 'member']]) {
      await setDoc(doc(db, `organizations/${ORG}/members/${uid}`), { userId: uid, joinedAt: new Date(), role });
    }
    await setDoc(doc(db, `organizations/${AYTO}/members/admin1`), { userId: 'admin1', joinedAt: new Date(), role: 'admin' });
    await setDoc(doc(db, path('expense_fiestas')), { ...category('admin1'), createdAt: new Date() });
  });
});

describe('ledgerCategories', () => {
  it('an admin creates a well-formed category, signed and stamped', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(setDoc(doc(db, path('income_rifa')), category('admin1', { name: 'Rifa', kind: 'income' })));
    await assertFails(setDoc(doc(db, path('n1')), category('admin1', { name: '' })));
    await assertFails(setDoc(doc(db, path('n2')), category('admin1', { name: 'x'.repeat(61) })));
    await assertFails(setDoc(doc(db, path('n3')), category('admin1', { kind: 'gift' })));
    await assertFails(setDoc(doc(db, path('n4')), category('admin2')));
    await assertFails(setDoc(doc(db, path('n5')), category('admin1', { createdAt: new Date('2020-01-01') })));
    await assertFails(setDoc(doc(db, path('n6')), { ...category('admin1'), extra: true }));
    await assertFails(setDoc(doc(db, path('n7', AYTO)), category('admin1')));
  });

  it('a member neither reads nor writes them', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertFails(getDoc(doc(db, path('expense_fiestas'))));
    await assertFails(getDocs(collection(db, `organizations/${ORG}/ledgerCategories`)));
    await assertFails(setDoc(doc(db, path('n8')), category('member1')));
    await assertFails(deleteDoc(doc(db, path('expense_fiestas'))));
  });

  it('an admin reads the list, renames only the name, and deletes', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(getDocs(collection(db, `organizations/${ORG}/ledgerCategories`)));
    await assertSucceeds(updateDoc(doc(db, path('expense_fiestas')), { name: 'FIESTAS' }));
    await assertFails(updateDoc(doc(db, path('expense_fiestas')), { kind: 'income' }));
    await assertFails(updateDoc(doc(db, path('expense_fiestas')), { createdBy: 'admin2', name: 'x' }));
    await assertFails(setDoc(doc(db, path('expense_fiestas')), category('admin1')));
    await assertSucceeds(deleteDoc(doc(db, path('expense_fiestas'))));
  });

  it('a rename to a new name moves the category in one batch', async () => {
    const db = asUser(getEnv(), 'admin1');
    const batch = writeBatch(db);
    batch.delete(doc(db, path('expense_fiestas')));
    batch.set(doc(db, path('expense_verbena')), category('admin1', { name: 'Verbena' }));
    await assertSucceeds(batch.commit());
  });
});
