// vi.mock factories fake the firebase/firestore SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const batch = {
  delete: vi.fn<(ref: unknown) => void>(),
  set: vi.fn<(ref: unknown, data: unknown) => void>(),
  commit: vi.fn<() => Promise<void>>(),
};

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  organizationLedgerCategoriesCollection: vi.fn((_db, orgId: string) => ({ _coll: `organizations/${orgId}/ledgerCategories` })),
  organizationRecordsWriteDoc: vi.fn((_db, orgId: string, coll: string, id: string) => ({ _path: `organizations/${orgId}/${coll}/${id}` })),
}));
vi.mock('firebase/firestore', () => ({
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(() => batch),
  onSnapshot: vi.fn(),
}));

import { deleteDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { buildLedgerCategoryData } from '../../src/models/organization/LedgerCategoryDataModel';
import {
  createLedgerCategory,
  deleteLedgerCategory,
  renameLedgerCategory,
  watchLedgerCategories,
  type LedgerCategory,
} from '../../src/services/ledgerCategoryService';

const pathOf = (ref: unknown) => (ref as { _path: string })._path;

const FIESTAS: LedgerCategory = { id: 'expense_fiestas', ...buildLedgerCategoryData({ name: 'Fiestas', kind: 'expense', createdBy: 'a1' }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ledgerCategoryService', () => {
  it('createLedgerCategory writes the cleaned name at the id of kind + lowercase name, stamped by the server', async () => {
    const id = await createLedgerCategory('org1', { kind: 'income', name: ' Lotería ' }, 'admin1');
    expect(id).toBe(`income_${encodeURIComponent('lotería')}`);
    const [ref, data] = vi.mocked(setDoc).mock.calls[0];
    expect(pathOf(ref)).toBe(`organizations/org1/ledgerCategories/${id}`);
    expect(data).toEqual({ name: 'Lotería', kind: 'income', createdBy: 'admin1', createdAt: 'SERVER_TS' });
  });

  it('createLedgerCategory refuses an empty or too long name before writing', async () => {
    await expect(createLedgerCategory('org1', { kind: 'income', name: '   ' }, 'admin1')).rejects.toThrow();
    await expect(createLedgerCategory('org1', { kind: 'income', name: 'x'.repeat(61) }, 'admin1')).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('a change of case only rewrites the name in place', async () => {
    await renameLedgerCategory('org1', FIESTAS, 'FIESTAS', 'admin2');
    const [ref, data] = vi.mocked(updateDoc).mock.calls[0];
    expect(pathOf(ref)).toBe('organizations/org1/ledgerCategories/expense_fiestas');
    expect(data).toEqual({ name: 'FIESTAS' });
    expect(batch.commit).not.toHaveBeenCalled();
  });

  it('any other rename moves the category to its new id in one batch', async () => {
    await renameLedgerCategory('org1', FIESTAS, 'Verbena', 'admin2');
    expect(pathOf(batch.delete.mock.calls[0][0])).toBe('organizations/org1/ledgerCategories/expense_fiestas');
    const [ref, data] = batch.set.mock.calls[0];
    expect(pathOf(ref)).toBe('organizations/org1/ledgerCategories/expense_verbena');
    expect(data).toEqual({ name: 'Verbena', kind: 'expense', createdBy: 'admin2', createdAt: 'SERVER_TS' });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('deleteLedgerCategory deletes the doc', async () => {
    await deleteLedgerCategory('org1', 'expense_fiestas');
    expect(pathOf(vi.mocked(deleteDoc).mock.calls[0][0])).toBe('organizations/org1/ledgerCategories/expense_fiestas');
  });
});

describe('ledgerCategoryService — reads', () => {
  it('watchLedgerCategories listens to the whole list of the group', () => {
    watchLedgerCategories('org1', vi.fn(), vi.fn());
    expect(vi.mocked(onSnapshot).mock.calls[0][0]).toEqual({ _coll: 'organizations/org1/ledgerCategories' });
  });
});
