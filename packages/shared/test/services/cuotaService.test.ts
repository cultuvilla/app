// vi.mock factories fake the firebase/firestore SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  organizationCuotaSettingsDoc: vi.fn(),
  organizationCuotaAssignmentDoc: vi.fn(),
  organizationCuotaAssignmentsCollection: vi.fn(),
  organizationCuotaPaymentsCollection: vi.fn((_db, orgId: string) => ({ _coll: `organizations/${orgId}/cuotaPayments` })),
  organizationCuotaRemindersCollection: vi.fn(),
  organizationCuotaWriteDoc: vi.fn((_db, orgId: string, coll: string, id: string) => ({ _path: `organizations/${orgId}/${coll}/${id}` })),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => (args.length === 1 ? { id: 'new-payment' } : { _path: args.slice(1).join('/') })),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
}));

import { setDoc } from 'firebase/firestore';
import {
  recordCuotaPayment,
  reverseCuotaPayment,
  saveCuotaSettings,
  setCuotaAssignment,
  type CuotaPayment,
} from '../../src/services/cuotaService';

const written = (i = 0) => {
  const [ref, data] = vi.mocked(setDoc).mock.calls[i];
  return { path: (ref as unknown as { _path: string })._path, data: data as Record<string, unknown> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cuotaService', () => {
  it('saveCuotaSettings writes the settings doc, stamped by the server and signed by the admin', async () => {
    await saveCuotaSettings(
      'org1',
      { amountCents: 3000, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 30, startPeriod: '2026', bizum: ' 600 ' },
      'admin1',
    );
    const { path, data } = written();
    expect(path).toBe('organizations/org1/cuotaSettings/current');
    expect(data).toMatchObject({ amountCents: 3000, bizum: '600', configuredBy: 'admin1', remindersEnabled: false, updatedAt: 'SERVER_TS' });
  });

  it('saveCuotaSettings refuses an invalid cuota before writing', async () => {
    await expect(
      saveCuotaSettings('org1', { amountCents: -1, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 0, startPeriod: '2026' }, 'a'),
    ).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('setCuotaAssignment keys the doc by socio', async () => {
    await setCuotaAssignment('org1', 's1', { tierId: 'jub', exempt: false, customAmountCents: null }, 'admin1');
    const { path, data } = written();
    expect(path).toBe('organizations/org1/cuotaAssignments/s1');
    expect(data).toMatchObject({ tierId: 'jub', exempt: false, customAmountCents: null, updatedBy: 'admin1', updatedAt: 'SERVER_TS' });
  });

  it('recordCuotaPayment appends a payment entry with a fresh id', async () => {
    const id = await recordCuotaPayment(
      'org1',
      { socioId: 's1', periodKey: '2026', amountCents: 3000, method: 'bizum', paidOn: '2026-02-20', note: '' },
      'admin1',
    );
    expect(id).toBe('new-payment');
    const { path, data } = written();
    expect(path).toBe('organizations/org1/cuotaPayments/new-payment');
    expect(data).toMatchObject({ kind: 'payment', reversesId: null, note: null, recordedBy: 'admin1', recordedAt: 'SERVER_TS' });
  });

  it('reverseCuotaPayment writes rev_<id> copying the payment', async () => {
    const payment: CuotaPayment = {
      id: 'p1', socioId: 's1', periodKey: '2026', kind: 'payment', reversesId: null, amountCents: 3000,
      method: 'efectivo', paidOn: '2026-02-20', note: null, recordedBy: 'admin1', recordedAt: new Date(),
    };
    await reverseCuotaPayment('org1', payment, 'duplicado', 'admin2');
    const { path, data } = written();
    expect(path).toBe('organizations/org1/cuotaPayments/rev_p1');
    expect(data).toMatchObject({ kind: 'reversal', reversesId: 'p1', amountCents: 3000, socioId: 's1', periodKey: '2026', note: 'duplicado', recordedBy: 'admin2' });
  });

  it('reverseCuotaPayment refuses to reverse a reversal', async () => {
    const reversal = { id: 'rev_p1', kind: 'reversal' } as CuotaPayment;
    await expect(reverseCuotaPayment('org1', reversal, null, 'a')).rejects.toThrow();
  });
});
