// vi.mock factories fake the firebase/firestore SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  organizationActasCollection: vi.fn((_db, orgId: string) => ({ _coll: `organizations/${orgId}/actas` })),
  organizationLedgerEntriesCollection: vi.fn((_db, orgId: string) => ({ _coll: `organizations/${orgId}/ledgerEntries` })),
  organizationRecordsWriteDoc: vi.fn((_db, orgId: string, coll: string, id: string) => ({ _path: `organizations/${orgId}/${coll}/${id}` })),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => (args.length === 1 ? { id: 'new-id' } : { _path: args.slice(1).join('/') })),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
}));

import { setDoc, updateDoc } from 'firebase/firestore';
import { buildLedgerEntryData, buildLedgerReversalData } from '../../src/models/organization/RecordsDataModel';
import {
  createActa,
  recordLedgerEntry,
  reverseLedgerEntry,
  updateActa,
  type LedgerEntry,
} from '../../src/services/recordsService';

const written = (i = 0) => {
  const [ref, data] = vi.mocked(setDoc).mock.calls[i];
  return { path: (ref as unknown as { _path: string })._path, data: data as Record<string, unknown> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordsService — actas', () => {
  it('createActa writes the acta, hidden from socios, stamped by the server and signed by the admin', async () => {
    const id = await createActa('org1', { body: 'asamblea_general', heldOn: '2026-03-15', agenda: ['Cuentas', ''] }, 'admin1');
    expect(id).toBe('new-id');
    const { path, data } = written();
    expect(path).toBe('organizations/org1/actas/new-id');
    expect(data).toMatchObject({
      agenda: ['Cuentas'],
      visibleToSocios: false,
      createdBy: 'admin1',
      updatedBy: 'admin1',
      createdAt: 'SERVER_TS',
      updatedAt: 'SERVER_TS',
    });
  });

  it('updateActa rewrites the fields and the editor, never the author', async () => {
    await updateActa('org1', 'a1', { body: 'junta_directiva', heldOn: '2026-04-01', visibleToSocios: true }, 'admin2');
    const [ref, data] = vi.mocked(updateDoc).mock.calls[0];
    expect((ref as unknown as { _path: string })._path).toBe('organizations/org1/actas/a1');
    expect(data).toMatchObject({ body: 'junta_directiva', visibleToSocios: true, updatedBy: 'admin2', updatedAt: 'SERVER_TS' });
    expect(data).not.toHaveProperty('createdBy');
    expect(data).not.toHaveProperty('createdAt');
  });

  it('refuses a malformed day before writing', async () => {
    await expect(createActa('org1', { body: 'otro', heldOn: '15/03/2026' }, 'admin1')).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe('recordsService — ledger', () => {
  it('recordLedgerEntry writes an entry with a fresh id', async () => {
    await recordLedgerEntry('org1', { kind: 'expense', amountCents: 12000, on: '2026-08-01', concept: ' Orquesta ', category: '' }, 'admin1');
    const { path, data } = written();
    expect(path).toBe('organizations/org1/ledgerEntries/new-id');
    expect(data).toMatchObject({ concept: 'Orquesta', category: null, reversesId: null, recordedBy: 'admin1', recordedAt: 'SERVER_TS' });
  });

  it('reverseLedgerEntry writes the copy at rev_<id>, and a reversal cannot be reversed', async () => {
    const entry: LedgerEntry = {
      id: 'e1',
      ...buildLedgerEntryData({ kind: 'income', amountCents: 500, on: '2026-05-01', concept: 'Rifa', recordedBy: 'admin1' }),
    };
    await reverseLedgerEntry('org1', entry, 'admin2');
    const { path, data } = written();
    expect(path).toBe('organizations/org1/ledgerEntries/rev_e1');
    expect(data).toMatchObject({ reversesId: 'e1', amountCents: 500, on: '2026-05-01', recordedBy: 'admin2' });

    const reversal: LedgerEntry = { id: 'rev_e1', ...buildLedgerReversalData(entry, { recordedBy: 'admin2' }) };
    await expect(reverseLedgerEntry('org1', reversal, 'admin2')).rejects.toThrow();
  });
});
