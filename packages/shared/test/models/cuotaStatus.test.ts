import { describe, it, expect } from 'vitest';
import {
  buildCuotaPaymentData,
  buildCuotaReversalData,
  buildCuotaSettingsData,
  CuotaPaymentDataSchema,
  CuotaSettingsDataSchema,
  type CuotaAssignmentData,
  type CuotaPaymentData,
  type CuotaSettingsData,
} from '../../src/models/organization/CuotaDataModel';
import {
  addDays,
  computeCuotaStatuses,
  cuotaConcept,
  cuotaPriceFor,
  cuotaReminderStage,
  cuotaSigner,
  netPaidBySocio,
  owedCents,
  parseEuroCents,
  periodBounds,
  periodDueDay,
  periodKeyFor,
  periodLabel,
  shiftPeriod,
  type CuotaSocio,
} from '../../src/models/organization/cuotaStatus';

const settings = (over: Partial<CuotaSettingsData> = {}): CuotaSettingsData =>
  buildCuotaSettingsData({
    amountCents: 3000,
    periodicity: 'yearly',
    dueMonth: 3,
    dueDay: 1,
    graceDays: 30,
    startPeriod: '2026',
    tiers: [
      { id: 'jub', name: 'Jubilados', amountCents: 1500, coversPersonas: false },
      { id: 'fam', name: 'Familiar', amountCents: 5000, coversPersonas: true },
    ],
    configuredBy: 'admin',
    ...over,
  });

const socio = (id: string, over: Partial<CuotaSocio> = {}): CuotaSocio => ({
  id,
  kind: 'member',
  displayName: id,
  uid: id,
  responsibleUid: null,
  adminTitle: null,
  altaAt: new Date('2025-01-10T10:00:00Z'),
  bajaAt: null,
  ...over,
});

let seq = 0;
const pay = (socioId: string, amountCents: number, over: Partial<CuotaPaymentData> = {}) => ({
  id: `p${String(++seq)}`,
  ...buildCuotaPaymentData({
    socioId,
    periodKey: '2026',
    amountCents,
    method: 'bizum',
    paidOn: '2026-02-20',
    recordedBy: 'admin',
  }),
  ...over,
});

const assignment = (over: Partial<CuotaAssignmentData>): CuotaAssignmentData => ({
  tierId: null,
  exempt: false,
  customAmountCents: null,
  updatedBy: 'admin',
  updatedAt: new Date(),
  ...over,
});

describe('periods', () => {
  it('keys a day by year or by month', () => {
    expect(periodKeyFor('yearly', '2026-10-20')).toBe('2026');
    expect(periodKeyFor('monthly', '2026-10-20')).toBe('2026-10');
  });

  it('bounds a period by its first and last day', () => {
    expect(periodBounds('2026')).toEqual({ first: '2026-01-01', last: '2026-12-31' });
    expect(periodBounds('2028-02')).toEqual({ first: '2028-02-01', last: '2028-02-29' });
  });

  it('clamps the due day to the month', () => {
    expect(periodDueDay(settings({ dueMonth: 2, dueDay: 31 }), '2026')).toBe('2026-02-28');
    expect(periodDueDay(settings({ periodicity: 'monthly', dueDay: 31 }), '2026-04')).toBe('2026-04-30');
    expect(periodDueDay(settings({ periodicity: 'monthly', dueDay: 5 }), '2026-12')).toBe('2026-12-05');
  });

  it('shifts periods and days across year boundaries', () => {
    expect(shiftPeriod('2026', -1)).toBe('2025');
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('labels a period for people', () => {
    expect(periodLabel('2026')).toBe('2026');
    expect(periodLabel('2026-03')).toBe('Marzo 2026');
  });
});

describe('owedCents', () => {
  const s = settings();
  it('is the base cuota without an assignment', () => {
    expect(owedCents(s, undefined, '2026')).toBe(3000);
  });
  it('is the tier price, a custom amount over it, and zero when exempt', () => {
    expect(owedCents(s, assignment({ tierId: 'jub' }), '2026')).toBe(1500);
    expect(owedCents(s, assignment({ tierId: 'jub', customAmountCents: 1000 }), '2026')).toBe(1000);
    expect(owedCents(s, assignment({ tierId: 'fam', exempt: true }), '2026')).toBe(0);
  });
  it('falls back to the base cuota for a tier that was deleted', () => {
    expect(owedCents(s, assignment({ tierId: 'gone' }), '2026')).toBe(3000);
  });
});

describe('prices by year', () => {
  const s = settings({
    yearAmounts: [{ year: '2027', amountCents: 3500 }],
    tiers: [{ id: 'jub', name: 'Jubilados', amountCents: 1500, yearAmounts: [{ year: '2027', amountCents: 1800 }], coversPersonas: false }],
  });

  it('charges the year its own price, and any other year the usual one', () => {
    expect(owedCents(s, undefined, '2027')).toBe(3500);
    expect(owedCents(s, undefined, '2026')).toBe(s.amountCents);
    expect(owedCents(s, assignment({ tierId: 'jub' }), '2027')).toBe(1800);
    expect(owedCents(s, assignment({ tierId: 'jub' }), '2026')).toBe(1500);
  });

  it('applies to every month of a monthly cuota', () => {
    expect(cuotaPriceFor(s, '2027-03')).toBe(3500);
    expect(cuotaPriceFor(s, '2026-12')).toBe(s.amountCents);
  });

  it('never moves a custom amount or an exemption', () => {
    expect(owedCents(s, assignment({ customAmountCents: 1000 }), '2027')).toBe(1000);
    expect(owedCents(s, assignment({ exempt: true }), '2027')).toBe(0);
  });

  it('marks a socio al día only for what that year costs', () => {
    const [row] = computeCuotaStatuses({
      settings: s,
      periodKey: '2027',
      today: '2027-01-01',
      socios: [{ id: 'a', kind: 'typed', displayName: 'Ana', uid: null, responsibleUid: null, adminTitle: null, altaAt: new Date('2020-01-01'), bajaAt: null }],
      assignments: {},
      payments: [{ ...buildCuotaPaymentData({ socioId: 'a', periodKey: '2027', amountCents: s.amountCents, method: 'bizum', paidOn: '2027-01-01', recordedBy: 'u' }), id: 'p' }],
    });
    expect(row?.owedCents).toBe(3500);
    expect(row?.basis).toBe('unpaid');
  });

  it('stores the years in order, and reads a doc saved without them', () => {
    const built = buildCuotaSettingsData({
      amountCents: 3000, periodicity: 'yearly', dueMonth: 1, dueDay: 1, graceDays: 0, startPeriod: '2026', configuredBy: 'u',
      yearAmounts: [{ year: '2028', amountCents: 1 }, { year: '2027', amountCents: 2 }],
      tiers: [{ id: 't', name: 'T', amountCents: 5, coversPersonas: false }],
    });
    expect(built.yearAmounts.map((y) => y.year)).toEqual(['2027', '2028']);
    expect(built.tiers[0]?.yearAmounts).toEqual([]);
    const { yearAmounts: _dropped, ...saved } = built;
    expect(CuotaSettingsDataSchema.parse(saved).yearAmounts).toEqual([]);
  });
});

describe('netPaidBySocio', () => {
  it('sums payments and drops reversed ones', () => {
    const a = pay('ana', 3000);
    const wrong = pay('ana', 3000);
    const rev = { id: `rev_${wrong.id}`, ...buildCuotaReversalData(wrong, { paidOn: '2026-02-21', recordedBy: 'admin' }) };
    const net = netPaidBySocio([a, wrong, rev, pay('luis', 1000)]);
    expect(net.get('ana')).toBe(3000);
    expect(net.get('luis')).toBe(1000);
  });
});

describe('computeCuotaStatuses', () => {
  const base = {
    settings: settings(),
    periodKey: '2026',
    assignments: {} as Record<string, CuotaAssignmentData>,
  };
  const statusOf = (rows: ReturnType<typeof computeCuotaStatuses>, id: string) => rows.find((r) => r.socioId === id);

  it('is pendiente through its due day, then vencida', () => {
    const socios = [socio('ana')];
    const before = computeCuotaStatuses({ ...base, socios, payments: [], today: '2026-02-01' });
    expect(statusOf(before, 'ana')).toMatchObject({ status: 'pendiente', basis: 'unpaid', owedCents: 3000, paidCents: 0, dueOn: '2026-03-01' });
    expect(statusOf(computeCuotaStatuses({ ...base, socios, payments: [], today: '2026-03-01' }), 'ana')?.status).toBe('pendiente');
    expect(statusOf(computeCuotaStatuses({ ...base, socios, payments: [], today: '2026-03-02' }), 'ana')?.status).toBe('vencida');
  });

  it('is al día once the payments cover what is owed, and not for a partial payment', () => {
    const socios = [socio('ana'), socio('luis')];
    const rows = computeCuotaStatuses({ ...base, socios, payments: [pay('ana', 3000), pay('luis', 1000)], today: '2026-05-01' });
    expect(statusOf(rows, 'ana')).toMatchObject({ status: 'al_dia', basis: 'paid', paidCents: 3000 });
    expect(statusOf(rows, 'luis')).toMatchObject({ status: 'vencida', basis: 'unpaid', paidCents: 1000 });
  });

  it('a reversed payment no longer counts', () => {
    const p = pay('ana', 3000);
    const rev = { id: `rev_${p.id}`, ...buildCuotaReversalData(p, { paidOn: '2026-02-21', recordedBy: 'admin' }) };
    const rows = computeCuotaStatuses({ ...base, socios: [socio('ana')], payments: [p, rev], today: '2026-02-22' });
    expect(statusOf(rows, 'ana')).toMatchObject({ status: 'pendiente', paidCents: 0 });
  });

  it('an exempt socio is al día', () => {
    const rows = computeCuotaStatuses({
      ...base,
      assignments: { ana: assignment({ exempt: true }) },
      socios: [socio('ana')],
      payments: [],
      today: '2026-06-01',
    });
    expect(statusOf(rows, 'ana')).toMatchObject({ status: 'al_dia', basis: 'exempt', owedCents: 0 });
  });

  it('a family payment against the member covers their personas a cargo', () => {
    const socios = [
      socio('mama', { uid: 'u-mama' }),
      socio('nene', { kind: 'persona', uid: null, responsibleUid: 'u-mama' }),
      socio('otro', { kind: 'persona', uid: null, responsibleUid: 'u-otro' }),
    ];
    const assignments = { mama: assignment({ tierId: 'fam' }) };
    const unpaid = computeCuotaStatuses({ ...base, assignments, socios, payments: [], today: '2026-04-15' });
    expect(statusOf(unpaid, 'mama')).toMatchObject({ status: 'vencida', owedCents: 5000 });
    expect(statusOf(unpaid, 'nene')).toMatchObject({ status: 'vencida', basis: 'household', householdOf: 'mama', owedCents: 0 });
    expect(statusOf(unpaid, 'otro')).toMatchObject({ status: 'vencida', basis: 'unpaid', owedCents: 3000, householdOf: null });

    const paid = computeCuotaStatuses({ ...base, assignments, socios, payments: [pay('mama', 5000)], today: '2026-04-15' });
    expect(statusOf(paid, 'mama')?.status).toBe('al_dia');
    expect(statusOf(paid, 'nene')).toMatchObject({ status: 'al_dia', basis: 'household', householdOf: 'mama' });
  });

  it('without a family tier, a persona owes its own cuota', () => {
    const socios = [socio('mama', { uid: 'u-mama' }), socio('nene', { kind: 'persona', uid: null, responsibleUid: 'u-mama' })];
    const rows = computeCuotaStatuses({ ...base, socios, payments: [pay('mama', 3000)], today: '2026-04-15' });
    expect(statusOf(rows, 'nene')).toMatchObject({ status: 'vencida', basis: 'unpaid', owedCents: 3000 });
  });

  it('lists only socios who were socios during the period', () => {
    const socios = [
      socio('old', { bajaAt: new Date('2025-06-01T10:00:00Z') }),
      socio('left', { bajaAt: new Date('2026-05-01T10:00:00Z') }),
      socio('future', { altaAt: new Date('2027-01-05T10:00:00Z') }),
    ];
    const rows = computeCuotaStatuses({ ...base, socios, payments: [], today: '2026-06-01' });
    expect(rows.map((r) => r.socioId)).toEqual(['left']);
  });

  it('a socio who joins after the due date owes it from their alta', () => {
    const rows = computeCuotaStatuses({
      ...base,
      socios: [socio('new', { altaAt: new Date('2026-09-10T10:00:00Z') })],
      payments: [],
      today: '2026-09-10',
    });
    expect(statusOf(rows, 'new')).toMatchObject({ status: 'pendiente', dueOn: '2026-09-10' });
  });

  it('owes nothing for a period before the group started tracking', () => {
    const rows = computeCuotaStatuses({ ...base, periodKey: '2025', socios: [socio('ana')], payments: [], today: '2026-06-01' });
    expect(rows).toEqual([]);
  });
});

describe('cuotaReminderStage', () => {
  const s = settings();
  const statusAt = (today: string, payments: ReturnType<typeof pay>[] = []) =>
    computeCuotaStatuses({ settings: s, periodKey: '2026', assignments: {}, socios: [socio('ana')], payments, today })[0];

  it('reminds in the week before the due date, and once vencida', () => {
    expect(cuotaReminderStage(statusAt('2026-02-21'), '2026-02-21')).toBeNull();
    expect(cuotaReminderStage(statusAt('2026-02-22'), '2026-02-22')).toBe('before');
    expect(cuotaReminderStage(statusAt('2026-03-01'), '2026-03-01')).toBe('before');
    expect(cuotaReminderStage(statusAt('2026-03-02'), '2026-03-02')).toBe('after');
  });

  it('never reminds a socio who is al día, or a persona the household covers', () => {
    expect(cuotaReminderStage(statusAt('2026-04-01', [pay('ana', 3000)]), '2026-04-01')).toBeNull();
    const [, household] = computeCuotaStatuses({
      settings: s,
      periodKey: '2026',
      assignments: { mama: assignment({ tierId: 'fam' }) },
      socios: [socio('mama'), socio('nene', { kind: 'persona', uid: null, responsibleUid: 'mama' })],
      payments: [],
      today: '2026-04-01',
    });
    expect(cuotaReminderStage(household, '2026-04-01')).toBeNull();
  });
});

describe('cuotaSigner', () => {
  const rows = [
    socio('ana', { displayName: 'Ana', adminTitle: 'presidente' }),
    socio('luis', { displayName: 'Luis', adminTitle: 'tesorero' }),
    socio('eva', { displayName: 'Eva' }),
  ];
  it('is the tesorero when an admin carries that title', () => {
    expect(cuotaSigner(rows, ['ana', 'luis', 'eva'], 'eva')).toEqual({ uid: 'luis', name: 'Luis', title: 'tesorero' });
  });
  it('else the admin who configured the cuota', () => {
    expect(cuotaSigner(rows, ['ana', 'eva'], 'eva')).toEqual({ uid: 'eva', name: 'Eva', title: null });
  });
  it('else any admin, and null with none', () => {
    expect(cuotaSigner(rows, ['ana'], 'gone')).toEqual({ uid: 'ana', name: 'Ana', title: 'presidente' });
    expect(cuotaSigner(rows, [], 'gone')).toBeNull();
  });
  it('ignores bajas and former admins', () => {
    const left = [socio('luis', { displayName: 'Luis', adminTitle: 'tesorero', bajaAt: new Date() }), socio('eva', { displayName: 'Eva' })];
    expect(cuotaSigner(left, ['luis', 'eva'], 'eva')).toEqual({ uid: 'eva', name: 'Eva', title: null });
  });
});

describe('helpers', () => {
  it('suggests the payment concept', () => {
    expect(cuotaConcept('2026', 'Ana García')).toBe('Cuota 2026 — Ana García');
    expect(cuotaConcept('2026-03', 'Ana')).toBe('Cuota Marzo 2026 — Ana');
  });

  it('parses euro amounts typed the Spanish way', () => {
    expect(parseEuroCents('30')).toBe(3000);
    expect(parseEuroCents('30,5')).toBe(3050);
    expect(parseEuroCents(' 12.75 € ')).toBe(1275);
    expect(parseEuroCents('0')).toBe(0);
    expect(parseEuroCents('')).toBeNull();
    expect(parseEuroCents('abc')).toBeNull();
    expect(parseEuroCents('1,234')).toBeNull();
    expect(parseEuroCents('-3')).toBeNull();
  });
});

describe('schemas', () => {
  it('builds settings that parse, trimming how-to-pay and normalizing the IBAN', () => {
    const s = settings({});
    const built = buildCuotaSettingsData({ ...s, bizum: ' 600 ', iban: 'es12 3456  7890', payInstructions: '  ' });
    expect(CuotaSettingsDataSchema.parse(built)).toMatchObject({ bizum: '600', iban: 'ES12 3456 7890', payInstructions: null, remindersEnabled: false });
  });

  it('refuses a zero payment and a malformed day', () => {
    expect(CuotaPaymentDataSchema.safeParse(pay('ana', 0)).success).toBe(false);
    expect(CuotaPaymentDataSchema.safeParse(pay('ana', 100, { paidOn: '2026-02-30' })).success).toBe(false);
    expect(CuotaPaymentDataSchema.safeParse(pay('ana', 100)).success).toBe(true);
  });
});
