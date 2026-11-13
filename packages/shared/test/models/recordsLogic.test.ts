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
  asambleaAccountsYear,
  asambleaChecklist,
  asambleaTaskInput,
  buildYearSummary,
  isAsambleaTask,
  libroDeSocios,
  nextAsambleaDay,
  upcomingAsamblea,
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

describe('ahead of the asamblea', () => {
  const yearly = { kind: 'calendar' as const, unit: 'year' as const, interval: 1, anchorOn: '2027-03-15' };
  const task = (title: string, dueOn: string | null, doneAt: Date | null = null) => ({ title, dueOn, doneAt, recurrence: yearly });

  it('finds the open asamblea task due within 45 days, overdue included', () => {
    expect(upcomingAsamblea([task('Asamblea general', '2027-03-15')], '2027-02-01')?.dueOn).toBe('2027-03-15');
    expect(upcomingAsamblea([task('Asamblea general', '2027-03-15')], '2027-01-28')).toBeNull();
    expect(upcomingAsamblea([task('Asamblea general', '2027-03-15')], '2027-03-20')?.dueOn).toBe('2027-03-15');
    expect(upcomingAsamblea([task('Asamblea general', '2027-03-15', new Date())], '2027-03-01')).toBeNull();
    expect(upcomingAsamblea([task('Limpiar el local', '2027-03-15')], '2027-03-01')).toBeNull();
    expect(upcomingAsamblea([task('Asamblea', '2027-03-20'), task('Asamblea', '2027-03-10')], '2027-03-01')?.dueOn).toBe('2027-03-10');
  });

  it('approves the year before at a spring asamblea and the same year at an autumn one', () => {
    expect(asambleaAccountsYear('2027-03-15')).toBe('2026');
    expect(asambleaAccountsYear('2026-06-30')).toBe('2025');
    expect(asambleaAccountsYear('2026-11-22')).toBe('2026');
  });

  const acta = (heldOn: string, visibleToSocios: boolean, body: 'asamblea_general' | 'junta_directiva' = 'asamblea_general') => ({
    body,
    heldOn,
    visibleToSocios,
  });

  it('is all ticked when every socio is numbered, the last asamblea acta is shared and the year has entries', () => {
    expect(
      asambleaChecklist({
        asambleaDay: '2027-03-15',
        socios: [
          { socioNumber: 1, bajaAt: null },
          { socioNumber: null, bajaAt: new Date() },
        ],
        actas: [acta('2026-03-14', true), acta('2027-03-15', false)],
        accountsYear: '2026',
        accountsEntries: 12,
      }),
    ).toEqual([
      { item: 'libro', ok: true },
      { item: 'acta', ok: true },
      { item: 'cuentas', ok: true, year: '2026', entries: 12 },
    ]);
  });

  it('counts active socios with no number, and ignores numbering in a group that uses none', () => {
    const numbered = asambleaChecklist({
      asambleaDay: '2027-03-15',
      socios: [
        { socioNumber: 1, bajaAt: null },
        { socioNumber: null, bajaAt: null },
        { socioNumber: null, bajaAt: null },
      ],
      actas: [],
      accountsYear: '2026',
      accountsEntries: 0,
    });
    expect(numbered[0]).toEqual({ item: 'libro', ok: false, unnumbered: 2 });
    expect(numbered[2]).toEqual({ item: 'cuentas', ok: false, year: '2026', entries: 0 });

    const unnumbered = asambleaChecklist({
      asambleaDay: '2027-03-15',
      socios: [{ socioNumber: null, bajaAt: null }],
      actas: [],
      accountsYear: '2026',
      accountsEntries: 0,
    });
    expect(unnumbered[0]).toEqual({ item: 'libro', ok: true });
  });

  it('flags a missing or unshared acta of the previous asamblea general, junta actas aside', () => {
    const base = { asambleaDay: '2027-03-15', socios: [], accountsYear: '2026', accountsEntries: 1 };
    expect(asambleaChecklist({ ...base, actas: [acta('2026-10-01', true, 'junta_directiva')] })[1]).toEqual({
      item: 'acta',
      ok: false,
      reason: 'missing',
    });
    expect(asambleaChecklist({ ...base, actas: [acta('2025-03-15', true), acta('2026-03-15', false)] })[1]).toEqual({
      item: 'acta',
      ok: false,
      reason: 'hidden',
    });
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
