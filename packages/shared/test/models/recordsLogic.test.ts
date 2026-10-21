import { describe, it, expect } from 'vitest';
import { buildCuotaPaymentData, buildCuotaReversalData } from '../../src/models/organization/CuotaDataModel';
import {
  ActaDataSchema,
  buildActaData,
  buildLedgerEntryData,
  buildLedgerReversalData,
  compareActas,
  LedgerEntryDataSchema,
} from '../../src/models/organization/RecordsDataModel';
import {
  asambleaTaskInput,
  buildYearSummary,
  isAsambleaTask,
  libroDeSocios,
  nextAsambleaDay,
} from '../../src/models/organization/recordsLogic';

const cuota = (id: string, periodKey: string, amountCents: number, paidOn: string) => ({
  id,
  ...buildCuotaPaymentData({ socioId: 's', periodKey, amountCents, method: 'bizum', paidOn, recordedBy: 'a' }),
});
const entry = (id: string, kind: 'income' | 'expense', amountCents: number, on: string, category: string | null = null) => ({
  id,
  ...buildLedgerEntryData({ kind, amountCents, on, concept: id, category, recordedBy: 'a' }),
});

describe('libroDeSocios', () => {
  it('orders every row by alta, bajas included, then by name', () => {
    const rows = [
      { displayName: 'Carla', altaAt: new Date('2026-05-01'), bajaAt: null },
      { displayName: 'Benito', altaAt: new Date('2025-01-01'), bajaAt: new Date('2026-01-01') },
      { displayName: 'Ana', altaAt: new Date('2026-05-01'), bajaAt: null },
    ];
    expect(libroDeSocios(rows).map((r) => r.displayName)).toEqual(['Benito', 'Ana', 'Carla']);
  });
});

describe('asamblea anual', () => {
  it('suggests the next 15 March, today included', () => {
    expect(nextAsambleaDay('2026-10-21')).toBe('2027-03-15');
    expect(nextAsambleaDay('2026-03-15')).toBe('2026-03-15');
    expect(nextAsambleaDay('2026-01-02')).toBe('2026-03-15');
  });

  it('builds a yearly calendar task anchored on its first day, the agenda in the notes', () => {
    expect(asambleaTaskInput('2026-10-21', { title: 'Asamblea general anual', agenda: '1. Acta' })).toEqual({
      title: 'Asamblea general anual',
      notes: '1. Acta',
      dueOn: '2027-03-15',
      recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: '2027-03-15' },
    });
  });

  it('recognises a yearly calendar task titled Asamblea, accents and case aside', () => {
    const yearly = { kind: 'calendar' as const, unit: 'year' as const, interval: 1, anchorOn: '2026-03-15' };
    expect(isAsambleaTask({ title: 'ASAMBLEA general', recurrence: yearly })).toBe(true);
    expect(isAsambleaTask({ title: 'Asamblea', recurrence: null })).toBe(false);
    expect(isAsambleaTask({ title: 'Asamblea', recurrence: { ...yearly, unit: 'month' } })).toBe(false);
    expect(isAsambleaTask({ title: 'Revisar extintores', recurrence: yearly })).toBe(false);
  });
});

describe('buildYearSummary', () => {
  it('nets cuota income per period by the day paid, and cancels a reversed payment in any year', () => {
    const wrong = cuota('c3', '2026', 3000, '2026-12-30');
    const summary = buildYearSummary({
      year: '2026',
      cuotaPayments: [
        cuota('c1', '2026', 3000, '2026-02-01'),
        cuota('c2', '2025', 3000, '2026-01-10'),
        cuota('c4', '2027', 3000, '2027-01-05'),
        wrong,
        { id: 'rev_c3', ...buildCuotaReversalData(wrong, { paidOn: '2027-01-02', recordedBy: 'a' }) },
      ],
      ledgerEntries: [],
    });
    expect(summary.cuotaByPeriod).toEqual([
      { periodKey: '2025', cents: 3000, payments: 1 },
      { periodKey: '2026', cents: 3000, payments: 1 },
    ]);
    expect(summary.cuotaCents).toBe(6000);
  });

  it('adds manual income, subtracts expenses, and leaves reversed entries out of the totals', () => {
    const wrong = entry('e3', 'expense', 50000, '2026-08-15');
    const summary = buildYearSummary({
      year: '2026',
      cuotaPayments: [cuota('c1', '2026', 3000, '2026-02-01')],
      ledgerEntries: [
        entry('e1', 'income', 20000, '2026-08-14', 'Fiestas'),
        entry('e2', 'expense', 12000, '2026-08-01', 'Fiestas'),
        wrong,
        { id: 'rev_e3', ...buildLedgerReversalData(wrong, { recordedBy: 'a' }) },
        entry('e4', 'expense', 999, '2025-12-31'),
      ],
    });
    expect(summary).toMatchObject({ otherIncomeCents: 20000, incomeCents: 23000, expenseCents: 12000, balanceCents: 11000 });
    expect(summary.entries.map((e) => [e.entry.id, e.reversed])).toEqual([
      ['e2', false],
      ['e1', false],
      ['e3', true],
    ]);
    expect(summary.byCategory).toEqual([
      { kind: 'expense', category: 'Fiestas', cents: 12000 },
      { kind: 'income', category: 'Fiestas', cents: 20000 },
    ]);
  });
});

describe('RecordsDataModel', () => {
  it('builds a valid acta: trimmed, blank lines dropped, attendees deduplicated, hidden from socios', () => {
    const acta = buildActaData({
      body: 'junta_directiva',
      title: '  ',
      heldOn: '2026-10-20',
      place: ' Local ',
      attendees: [
        { socioId: 's1', name: ' Ana ' },
        { socioId: 's1', name: 'Ana' },
      ],
      agenda: ['Cuentas', ' ', 'Fiestas '],
      agreements: ['Se aprueba la cuota'],
      createdBy: 'a',
    });
    expect(ActaDataSchema.parse(acta)).toMatchObject({
      title: null,
      place: 'Local',
      attendees: [{ socioId: 's1', name: 'Ana' }],
      agenda: ['Cuentas', 'Fiestas'],
      visibleToSocios: false,
      updatedBy: 'a',
    });
  });

  it('orders actas newest meeting first', () => {
    const a = { heldOn: '2026-01-01', createdAt: new Date(1) };
    const b = { heldOn: '2026-06-01', createdAt: new Date(0) };
    expect([a, b].sort(compareActas)).toEqual([b, a]);
  });

  it('a ledger reversal copies the entry, its day included', () => {
    const e = entry('e1', 'income', 1500, '2026-05-01', 'Lotería');
    expect(LedgerEntryDataSchema.parse(buildLedgerReversalData(e, { recordedBy: 'b' }))).toMatchObject({
      kind: 'income', amountCents: 1500, on: '2026-05-01', category: 'Lotería', reversesId: 'e1', recordedBy: 'b',
    });
  });

  it('refuses a zero amount and a malformed day', () => {
    expect(() => LedgerEntryDataSchema.parse(entry('x', 'income', 0, '2026-05-01'))).toThrow();
    expect(() => LedgerEntryDataSchema.parse(entry('x', 'income', 1, '2026-5-1'))).toThrow();
  });
});
