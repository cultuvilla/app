import type { SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import type { CuotaPayment } from '@cultuvilla/shared/services/cuotaService';
import { cuotaReceipt, daysBetween, paidEntries } from '../cuotaReceipt';

const status = (socioId: string, over: Partial<SocioCuotaStatus> = {}): SocioCuotaStatus => ({
  socioId, status: 'pendiente', basis: 'unpaid', owedCents: 2500, paidCents: 0, dueOn: '2026-11-30', householdOf: null, ...over,
});

const payment = (id: string, over: Partial<CuotaPayment> = {}): CuotaPayment => ({
  id, socioId: 's1', periodKey: '2026', kind: 'payment', reversesId: null, amountCents: 2500, method: 'bizum',
  paidOn: '2026-01-10', note: null, recordedBy: 'admin', recordedAt: new Date(), ...over,
} as CuotaPayment);

describe('daysBetween', () => {
  it('counts calendar days, across months and backwards', () => {
    expect(daysBetween('2026-11-12', '2026-11-30')).toBe(18);
    expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1);
    expect(daysBetween('2026-03-10', '2026-03-05')).toBe(-5);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });
});

describe('cuotaReceipt', () => {
  it('sums what is still owed and takes the earliest due day', () => {
    const r = cuotaReceipt(
      [status('a', { paidCents: 1000 }), status('b', { dueOn: '2026-11-20' }), status('c', { status: 'al_dia', basis: 'paid', paidCents: 2500 })],
      '2026-11-12',
    );
    expect(r).toEqual({ status: 'pendiente', dueCents: 4000, paidCents: 3500, dueOn: '2026-11-20', daysLeft: 8 });
  });

  it('is as late as its latest row', () => {
    expect(cuotaReceipt([status('a'), status('b', { status: 'vencida', dueOn: '2026-03-05' })], '2026-11-12').status).toBe('vencida');
  });

  it('owes nothing and has no due day once everyone is al día', () => {
    const r = cuotaReceipt([status('a', { status: 'al_dia', basis: 'paid', paidCents: 2500 }), status('b', { status: 'al_dia', basis: 'household', owedCents: 0 })], '2026-11-12');
    expect(r).toEqual({ status: 'al_dia', dueCents: 0, paidCents: 2500, dueOn: null, daysLeft: null });
  });
});

describe('paidEntries', () => {
  it('lists payments newest period first, marks reversed ones and drops the reversals', () => {
    const entries = paidEntries([
      payment('old', { periodKey: '2024' }),
      payment('rev', { kind: 'reversal', reversesId: 'new' }),
      payment('new', { periodKey: '2026' }),
      payment('mid', { periodKey: '2025' }),
    ]);
    expect(entries.map((e) => [e.payment.id, e.reversed])).toEqual([
      ['new', true],
      ['mid', false],
      ['old', false],
    ]);
  });
});
