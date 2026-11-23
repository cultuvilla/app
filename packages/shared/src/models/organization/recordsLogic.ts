import type { CuotaPaymentData } from './CuotaDataModel';
import type { GroupTaskData, GroupTaskInput } from './GroupTaskDataModel';
import type { ActaData, LedgerEntryData, LedgerEntryKind } from './RecordsDataModel';
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

// ── Ahead of the asamblea ────────────────────────────────────────────────────

/** How many days before its asamblea a group sees what is missing for it. */
export const ASAMBLEA_CHECKLIST_DAYS_AHEAD = 45;

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The group's next asamblea, when it is close: its open asamblea task due from
 * today to `ASAMBLEA_CHECKLIST_DAYS_AHEAD` days on. An overdue one counts too —
 * the asamblea may have slipped, and the folder still has to be ready for it.
 */
export function upcomingAsamblea<T extends Pick<GroupTaskData, 'title' | 'recurrence' | 'dueOn' | 'doneAt'>>(
  tasks: readonly T[],
  today: string,
): (T & { dueOn: string }) | null {
  const horizon = addDays(today, ASAMBLEA_CHECKLIST_DAYS_AHEAD);
  const due = tasks
    .filter((t): t is T & { dueOn: string } => t.doneAt === null && t.dueOn !== null && isAsambleaTask(t) && t.dueOn <= horizon)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  return due[0] ?? null;
}

/**
 * The year whose accounts an asamblea approves: a spring asamblea closes the
 * year before, an autumn one the year it is held in.
 */
export function asambleaAccountsYear(asambleaDay: string): string {
  const year = Number(asambleaDay.slice(0, 4));
  return Number(asambleaDay.slice(5, 7)) <= 6 ? String(year - 1) : String(year);
}

export type AsambleaCheck =
  | { item: 'libro'; ok: true }
  | { item: 'libro'; ok: false; unnumbered: number }
  | { item: 'acta'; ok: true }
  | { item: 'acta'; ok: false; reason: 'missing' | 'hidden' }
  | { item: 'cuentas'; ok: boolean; year: string; entries: number };

/**
 * What the folder needs before the asamblea, from data that already exists:
 * every active socio numbered (when the group numbers them at all), the
 * previous asamblea general's acta written and shared, and the year's
 * accounts with something in them.
 */
export function asambleaChecklist(input: {
  asambleaDay: string;
  socios: readonly Pick<SocioData, 'socioNumber' | 'bajaAt'>[];
  actas: readonly Pick<ActaData, 'body' | 'heldOn' | 'visibleToSocios'>[];
  accountsYear: string;
  /** Cuota payments and ledger entries counted in `accountsYear`, reversals left out. */
  accountsEntries: number;
}): AsambleaCheck[] {
  const active = input.socios.filter((s) => s.bajaAt === null);
  const numbers = input.socios.some((s) => s.socioNumber !== null);
  const unnumbered = numbers ? active.filter((s) => s.socioNumber === null).length : 0;

  const previous = input.actas
    .filter((a) => a.body === 'asamblea_general' && a.heldOn < input.asambleaDay)
    .sort((a, b) => b.heldOn.localeCompare(a.heldOn))
    .at(0);

  return [
    unnumbered > 0 ? { item: 'libro', ok: false, unnumbered } : { item: 'libro', ok: true },
    !previous
      ? { item: 'acta', ok: false, reason: 'missing' }
      : previous.visibleToSocios
        ? { item: 'acta', ok: true }
        : { item: 'acta', ok: false, reason: 'hidden' },
    { item: 'cuentas', ok: input.accountsEntries > 0, year: input.accountsYear, entries: input.accountsEntries },
  ];
}
