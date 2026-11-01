import type { CuotaPaymentData } from './CuotaDataModel';
import type { GroupTaskData, GroupTaskInput } from './GroupTaskDataModel';
import type { LedgerEntryData, LedgerEntryKind } from './RecordsDataModel';
import type { SocioData } from './SocioDataModel';

// ── Libro de socios ──────────────────────────────────────────────────────────

/** Every socio row ever, in the order they joined: the libro de socios. */
export function libroDeSocios<T extends Pick<SocioData, 'altaAt' | 'displayName'>>(socios: readonly T[]): T[] {
  return [...socios].sort((a, b) => a.altaAt.getTime() - b.altaAt.getTime() || a.displayName.localeCompare(b.displayName, 'es'));
}

// ── Asamblea anual ───────────────────────────────────────────────────────────

/** The day of the year the suggested asamblea falls on, before the admin moves it. */
export const ASAMBLEA_SUGGESTED_MONTH_DAY = '03-15';

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** A yearly calendar task whose title starts with "Asamblea" — the group already tracks its asamblea. */
export function isAsambleaTask(task: Pick<GroupTaskData, 'title' | 'recurrence'>): boolean {
  return task.recurrence?.kind === 'calendar' && task.recurrence.unit === 'year' && normalized(task.title).startsWith('asamblea');
}

/** The next 15 March from `today` (a Madrid day key), today included. */
export function nextAsambleaDay(today: string): string {
  const year = Number(today.slice(0, 4));
  const thisYear = `${String(year)}-${ASAMBLEA_SUGGESTED_MONTH_DAY}`;
  return thisYear >= today ? thisYear : `${String(year + 1)}-${ASAMBLEA_SUGGESTED_MONTH_DAY}`;
}

/** The suggested asamblea anual: a task every year on the same day, its agenda in the notes. */
export function asambleaTaskInput(today: string, copy: { title: string; agenda: string }): Omit<GroupTaskInput, 'createdBy' | 'createdAt'> {
  const dueOn = nextAsambleaDay(today);
  return {
    title: copy.title,
    notes: copy.agenda,
    dueOn,
    recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: dueOn },
  };
}

// ── Yearly summary ───────────────────────────────────────────────────────────

export interface CuotaPeriodIncome {
  periodKey: string;
  cents: number;
  payments: number;
}

export interface YearLedgerEntry<T> {
  entry: T;
  reversed: boolean;
}

export interface CategoryTotal {
  kind: LedgerEntryKind;
  category: string | null;
  cents: number;
}

export interface YearSummary<T> {
  year: string;
  /** Cuota money that came in this year, per period it paid for. */
  cuotaByPeriod: CuotaPeriodIncome[];
  cuotaCents: number;
  otherIncomeCents: number;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** The year's entries (not the reversals), oldest first, each flagged when cancelled. */
  entries: YearLedgerEntry<T>[];
  byCategory: CategoryTotal[];
}

type WithId<T> = T & { id: string };

/**
 * A summary, not bookkeeping: what came in and went out in one calendar year.
 * A reversal cancels its entry wherever it is dated, so a corrected mistake
 * leaves no trace in either year. Cuota payments count in the year they were
 * paid (`paidOn`), whichever period they were for.
 */
type CuotaYearPayment = WithId<Pick<CuotaPaymentData, 'kind' | 'reversesId' | 'periodKey' | 'paidOn' | 'amountCents'>>;

export function buildYearSummary<L extends WithId<LedgerEntryData>>(input: {
  year: string;
  cuotaPayments: readonly CuotaYearPayment[];
  ledgerEntries: readonly L[];
}): YearSummary<L> {
  const { year } = input;
  const inYear = (day: string) => day.slice(0, 4) === year;

  const cuotaReversed = new Set(input.cuotaPayments.filter((p) => p.kind === 'reversal').map((p) => p.reversesId));
  const byPeriod = new Map<string, CuotaPeriodIncome>();
  for (const p of input.cuotaPayments) {
    if (p.kind !== 'payment' || !inYear(p.paidOn) || cuotaReversed.has(p.id)) continue;
    const row = byPeriod.get(p.periodKey) ?? { periodKey: p.periodKey, cents: 0, payments: 0 };
    row.cents += p.amountCents;
    row.payments += 1;
    byPeriod.set(p.periodKey, row);
  }
  const cuotaByPeriod = [...byPeriod.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  const cuotaCents = cuotaByPeriod.reduce((sum, r) => sum + r.cents, 0);

  const ledgerReversed = new Set(input.ledgerEntries.filter((e) => e.reversesId !== null).map((e) => e.reversesId));
  const entries = input.ledgerEntries
    .filter((e) => e.reversesId === null && inYear(e.on))
    .sort((a, b) => a.on.localeCompare(b.on) || a.recordedAt.getTime() - b.recordedAt.getTime())
    .map((entry) => ({ entry, reversed: ledgerReversed.has(entry.id) }));
  const live = entries.filter((e) => !e.reversed).map((e) => e.entry);

  const total = (kind: LedgerEntryKind) => live.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.amountCents, 0);
  const otherIncomeCents = total('income');
  const expenseCents = total('expense');

  const categories = new Map<string, CategoryTotal>();
  for (const e of live) {
    const key = `${e.kind}|${e.category ?? ''}`;
    const row = categories.get(key) ?? { kind: e.kind, category: e.category, cents: 0 };
    row.cents += e.amountCents;
    categories.set(key, row);
  }
  const byCategory = [...categories.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || b.cents - a.cents || (a.category ?? '').localeCompare(b.category ?? '', 'es'),
  );

  const incomeCents = cuotaCents + otherIncomeCents;
  return {
    year,
    cuotaByPeriod,
    cuotaCents,
    otherIncomeCents,
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    entries,
    byCategory,
  };
}

/** First and last Madrid day keys of a calendar year, for a range query on a day-key field. */
export function yearDayRange(year: string): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
