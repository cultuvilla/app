/**
 * The cuota's status, computed on read — never stored. One pure function, used
 * by the member's card, the admin's period list, the CSV export and the
 * reminder job, so the four can never disagree about who is al día.
 *
 * Days are Madrid calendar days as `YYYY-MM-DD` strings (see `madridDayKey`),
 * compared as strings: a due date is a day on a calendar, not an instant.
 */
import { formatDate } from '../../utils/format';
import { madridDayKey } from '../event/EventDataModel';
import type { OrgAdminTitle, SocioData } from './SocioDataModel';
import type {
  CuotaAssignmentData,
  CuotaPaymentData,
  CuotaPeriodicity,
  CuotaReminderStage,
  CuotaSettingsData,
  CuotaTier,
  PeriodKey,
} from './CuotaDataModel';

export type CuotaStatus = 'al_dia' | 'pendiente' | 'vencida';
export const CUOTA_STATUSES: readonly CuotaStatus[] = ['al_dia', 'pendiente', 'vencida'];

/**
 * Why the status is what it is. `household`: a persona a cargo whose
 * responsible member is on a tier that covers personas — it follows that
 * member's status and owes nothing itself.
 */
export type CuotaBasis = 'paid' | 'exempt' | 'household' | 'unpaid';

export type CuotaSocio = Pick<
  SocioData,
  'kind' | 'displayName' | 'uid' | 'responsibleUid' | 'adminTitle' | 'altaAt' | 'bajaAt'
> & { id: string };

export interface SocioCuotaStatus {
  socioId: string;
  status: CuotaStatus;
  basis: CuotaBasis;
  /** What this socio owes for the period itself (0 when exempt or covered by the household). */
  owedCents: number;
  /** Net of reversals. */
  paidCents: number;
  /** The due day for this socio: the period's, or their alta when it came later. */
  dueOn: string;
  /** For `household`: the socio row whose payment covers this one. */
  householdOf: string | null;
}

/** Days before the due date when the "before" reminder goes out. */
export const CUOTA_REMINDER_LEAD_DAYS = 7;

// ── Calendar days ────────────────────────────────────────────────────────────

function dayFromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcOf(day: string): Date {
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))));
}

export function addDays(day: string, n: number): string {
  const d = utcOf(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayFromUtc(d);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

// ── Periods ──────────────────────────────────────────────────────────────────

export function periodKeyFor(periodicity: CuotaPeriodicity, day: string): PeriodKey {
  return periodicity === 'yearly' ? day.slice(0, 4) : day.slice(0, 7);
}

/** The period the cuota is in today, in Madrid. */
export function currentPeriodKey(periodicity: CuotaPeriodicity, now: Date = new Date()): PeriodKey {
  return periodKeyFor(periodicity, madridDayKey(now));
}

function periodParts(key: PeriodKey): { year: number; month: number | null } {
  return { year: Number(key.slice(0, 4)), month: key.length > 4 ? Number(key.slice(5, 7)) : null };
}

export function periodBounds(key: PeriodKey): { first: string; last: string } {
  const { year, month } = periodParts(key);
  if (month === null) return { first: `${String(year)}-01-01`, last: `${String(year)}-12-31` };
  return {
    first: `${String(year)}-${pad(month)}-01`,
    last: `${String(year)}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
  };
}

/** The period's due day, with the day clamped to the month (31 → 30 April, 28/29 February). */
export function periodDueDay(settings: Pick<CuotaSettingsData, 'dueMonth' | 'dueDay'>, key: PeriodKey): string {
  const { year, month } = periodParts(key);
  const m = month ?? settings.dueMonth;
  const d = Math.min(settings.dueDay, lastDayOfMonth(year, m));
  return `${String(year)}-${pad(m)}-${pad(d)}`;
}

export function shiftPeriod(key: PeriodKey, delta: number): PeriodKey {
  const { year, month } = periodParts(key);
  if (month === null) return String(year + delta);
  const index = year * 12 + (month - 1) + delta;
  return `${String(Math.floor(index / 12))}-${pad((index % 12) + 1)}`;
}

/** "2026", or "Marzo 2026" for a monthly period. */
export function periodLabel(key: PeriodKey): string {
  const { year, month } = periodParts(key);
  if (month === null) return String(year);
  return formatDate(new Date(Date.UTC(year, month - 1, 15)), 'monthYear', 'UTC');
}

/** The suggested bank/Bizum concept: "Cuota 2026 — Ana García". */
export function cuotaConcept(key: PeriodKey, name: string): string {
  return `Cuota ${periodLabel(key)} — ${name.trim()}`;
}

// ── Amounts ──────────────────────────────────────────────────────────────────

/** The period's price of the base cuota or of a tier: its year's, else the usual one. */
export function cuotaPriceFor(priced: Pick<CuotaTier, 'amountCents' | 'yearAmounts'>, key: PeriodKey): number {
  const year = key.slice(0, 4);
  return priced.yearAmounts.find((y) => y.year === year)?.amountCents ?? priced.amountCents;
}

/** What a socio owes for one period, before any household cover. */
export function owedCents(
  settings: Pick<CuotaSettingsData, 'amountCents' | 'yearAmounts' | 'tiers'>,
  assignment: Pick<CuotaAssignmentData, 'tierId' | 'exempt' | 'customAmountCents'> | undefined,
  key: PeriodKey,
): number {
  if (!assignment) return cuotaPriceFor(settings, key);
  if (assignment.exempt) return 0;
  if (assignment.customAmountCents !== null) return assignment.customAmountCents;
  const tier = settings.tiers.find((t) => t.id === assignment.tierId);
  return cuotaPriceFor(tier ?? settings, key);
}

/** Net paid per socio: payments minus the ones a reversal cancelled. */
export function netPaidBySocio(payments: (CuotaPaymentData & { id: string })[]): Map<string, number> {
  const reversed = new Set(payments.filter((p) => p.kind === 'reversal').map((p) => p.reversesId));
  const net = new Map<string, number>();
  for (const p of payments) {
    if (p.kind !== 'payment' || reversed.has(p.id)) continue;
    net.set(p.socioId, (net.get(p.socioId) ?? 0) + p.amountCents);
  }
  return net;
}

/** "30", "30,5", "12.75 €" → cents; null for anything that is not a plain amount. */
export function parseEuroCents(text: string): number | null {
  const cleaned = text.replace(/€/g, '').trim();
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const euros = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  return euros * 100 + cents;
}

// ── Status ───────────────────────────────────────────────────────────────────

export interface CuotaStatusInput {
  settings: CuotaSettingsData;
  periodKey: PeriodKey;
  /** Today, as a Madrid day key. */
  today: string;
  socios: CuotaSocio[];
  /** Keyed by socio id; a socio without one pays the base cuota. */
  assignments: Partial<Record<string, CuotaAssignmentData>>;
  /** The period's ledger entries (others are ignored). */
  payments: (CuotaPaymentData & { id: string })[];
}

/** A socio during part of the period at least — a baja mid-year still owes that year. */
function wasSocioDuring(socio: CuotaSocio, bounds: { first: string; last: string }): boolean {
  if (madridDayKey(socio.altaAt) > bounds.last) return false;
  return socio.bajaAt === null || madridDayKey(socio.bajaAt) >= bounds.first;
}

/**
 * Status of every socio who was one during the period. Al día when paid (net of
 * reversals) at least what they owe, or exempt; otherwise pendiente until the
 * due day ends and vencida after it. A persona a cargo whose responsible
 * member is on a tier that covers personas follows that member: one household
 * payment marks them all paid. A period before `startPeriod` owes nothing.
 */
export function computeCuotaStatuses(input: CuotaStatusInput): SocioCuotaStatus[] {
  const { settings, periodKey, today, socios, assignments } = input;
  const bounds = periodBounds(periodKey);
  if (bounds.last < periodBounds(settings.startPeriod).first) return [];

  const periodDue = periodDueDay(settings, periodKey);
  const paid = netPaidBySocio(input.payments.filter((p) => p.periodKey === periodKey));
  const inPeriod = socios.filter((s) => wasSocioDuring(s, bounds));

  const own = (s: CuotaSocio): SocioCuotaStatus => {
    const altaDay = madridDayKey(s.altaAt);
    const dueOn = altaDay > periodDue ? altaDay : periodDue;
    const assignment = assignments[s.id];
    const owed = owedCents(settings, assignment, periodKey);
    const paidCents = paid.get(s.id) ?? 0;
    const settled = paidCents >= owed;
    return {
      socioId: s.id,
      status: settled ? 'al_dia' : today > dueOn ? 'vencida' : 'pendiente',
      basis: settled ? (owed === 0 ? 'exempt' : 'paid') : 'unpaid',
      owedCents: owed,
      paidCents,
      dueOn,
      householdOf: null,
    };
  };

  const byId = new Map(inPeriod.map((s) => [s.id, own(s)]));

  const coversPersonas = (memberRowId: string): boolean => {
    const tierId = assignments[memberRowId]?.tierId;
    return settings.tiers.some((t) => t.id === tierId && t.coversPersonas);
  };

  for (const s of inPeriod) {
    if (s.kind !== 'persona' || !s.responsibleUid) continue;
    const mine = byId.get(s.id);
    if (!mine || mine.status === 'al_dia') continue;
    const head = inPeriod.find((m) => m.kind === 'member' && m.uid === s.responsibleUid && coversPersonas(m.id));
    const headStatus = head ? byId.get(head.id) : undefined;
    if (!head || !headStatus) continue;
    byId.set(s.id, {
      ...mine,
      status: headStatus.status,
      basis: 'household',
      owedCents: 0,
      dueOn: headStatus.dueOn,
      householdOf: head.id,
    });
  }

  return inPeriod.flatMap((s) => {
    const status = byId.get(s.id);
    return status ? [status] : [];
  });
}

/**
 * Which reminder a socio is due today, if any: `before` in the week up to the
 * due day, `after` once vencida. Never for a socio who is al día, nor for a
 * persona the household covers — the responsible member's own reminder is the
 * one that counts. The job records each one sent, so each goes out once.
 */
export function cuotaReminderStage(status: SocioCuotaStatus, today: string): CuotaReminderStage | null {
  if (status.status === 'al_dia' || status.basis === 'household') return null;
  if (status.status === 'vencida') return 'after';
  if (today <= status.dueOn && today >= addDays(status.dueOn, -CUOTA_REMINDER_LEAD_DAYS)) return 'before';
  return null;
}

// ── Signer ───────────────────────────────────────────────────────────────────

export interface CuotaSigner {
  /** The admin's account, whose address a reminder's replies go to. */
  uid: string | null;
  name: string;
  title: OrgAdminTitle | null;
}

/**
 * Who signs the reminders: the admin titled tesorero; else the admin who last
 * configured the cuota; else any admin, titled ones first. Only active member
 * rows of current admins count. Null when the group has no admin on its roster.
 */
export function cuotaSigner(socios: CuotaSocio[], adminUids: readonly string[], configuredBy: string): CuotaSigner | null {
  const admins = new Set(adminUids);
  const rows = socios
    .filter((s) => s.kind === 'member' && s.uid !== null && admins.has(s.uid) && s.bajaAt === null && s.displayName.trim())
    .sort((a, b) => a.altaAt.getTime() - b.altaAt.getTime());
  const pick =
    rows.find((s) => s.adminTitle === 'tesorero') ??
    rows.find((s) => s.uid === configuredBy) ??
    rows.find((s) => s.adminTitle !== null) ??
    (rows.length > 0 ? rows[0] : undefined);
  return pick ? { uid: pick.uid, name: pick.displayName.trim(), title: pick.adminTitle } : null;
}
