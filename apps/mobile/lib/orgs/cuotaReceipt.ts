import type { CuotaStatus, SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import type { CuotaPayment } from '@cultuvilla/shared/services/cuotaService';

const SEVERITY: Record<CuotaStatus, number> = { al_dia: 0, pendiente: 1, vencida: 2 };

export interface CuotaReceipt {
  /** The worst status among the rows the member pays: one late persona makes the receipt late. */
  status: CuotaStatus;
  /** What is still owed for the period across those rows; 0 once al día. */
  dueCents: number;
  /** What was paid for the period across those rows, net of reversals. */
  paidCents: number;
  /** The earliest due day among the rows still owing; null once al día. */
  dueOn: string | null;
  /** Calendar days from `today` to `dueOn` (negative when overdue); null once al día. */
  daysLeft: number | null;
}

function dayNumber(day: string): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000;
}

/** Calendar days from one `YYYY-MM-DD` day to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round(dayNumber(to) - dayNumber(from));
}

/** One receipt for everything the member answers for this period. */
export function cuotaReceipt(statuses: readonly SocioCuotaStatus[], today: string): CuotaReceipt {
  const owing = statuses.filter((s) => s.status !== 'al_dia');
  const status = statuses.reduce<CuotaStatus>((worst, s) => (SEVERITY[s.status] > SEVERITY[worst] ? s.status : worst), 'al_dia');
  const dueCents = owing.reduce((sum, s) => sum + Math.max(0, s.owedCents - s.paidCents), 0);
  const paidCents = statuses.reduce((sum, s) => sum + s.paidCents, 0);
  const dueOn = owing.map((s) => s.dueOn).sort()[0] ?? null;
  return { status, dueCents, paidCents, dueOn, daysLeft: dueOn ? daysBetween(today, dueOn) : null };
}

export interface PaidEntry {
  payment: CuotaPayment;
  /** A treasurer reversed it: shown struck through, not counted. */
  reversed: boolean;
}

/**
 * The member's paid cuotas, newest period first. Reversal entries are
 * bookkeeping, not payments: they show only as the payment they cancel.
 */
export function paidEntries(payments: readonly CuotaPayment[]): PaidEntry[] {
  const reversed = new Set(payments.filter((p) => p.kind === 'reversal').map((p) => p.reversesId));
  return payments
    .filter((p) => p.kind === 'payment')
    .map((payment) => ({ payment, reversed: reversed.has(payment.id) }))
    .sort((a, b) => b.payment.periodKey.localeCompare(a.payment.periodKey) || b.payment.paidOn.localeCompare(a.payment.paidOn));
}
