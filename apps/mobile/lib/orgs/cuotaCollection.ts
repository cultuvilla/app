import type { CuotaPaymentMethod, SocioCuotaStatus } from '@cultuvilla/shared/models/organization';

/** The chips over the treasurer's list; "vencida" is the overdue part of "pending". */
export type CollectionFilter = 'pending' | 'vencida' | 'paid' | 'exempt';
export const COLLECTION_FILTERS: readonly CollectionFilter[] = ['pending', 'vencida', 'paid', 'exempt'];

export function inCollectionFilter(s: SocioCuotaStatus, filter: CollectionFilter): boolean {
  switch (filter) {
    case 'pending':
      return s.basis === 'unpaid';
    case 'vencida':
      return s.basis === 'unpaid' && s.status === 'vencida';
    case 'paid':
      return s.basis === 'paid';
    case 'exempt':
      return s.basis === 'exempt' || s.basis === 'household';
  }
}

export interface CollectionSummary {
  collectedCents: number;
  totalCents: number;
  /** Socios who owe something this period, and how many of them are settled. */
  payers: number;
  paid: number;
}

/** Collected vs total for the period. A household row owes and pays nothing itself. */
export function summarizeCollection(statuses: readonly SocioCuotaStatus[]): CollectionSummary {
  let collectedCents = 0;
  let totalCents = 0;
  let payers = 0;
  let paid = 0;
  for (const s of statuses) {
    if (s.basis === 'household') continue;
    collectedCents += Math.max(0, s.paidCents);
    totalCents += s.owedCents;
    if (s.basis === 'paid' || s.basis === 'unpaid') payers += 1;
    if (s.basis === 'paid') paid += 1;
  }
  return { collectedCents, totalCents, payers, paid };
}

/** Lowercase, accents stripped: "Álvaro" matches "alv". */
export function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** A name contains the query, or the query is the socio's number. */
export function matchesSocio(query: string, name: string, socioNumber: number | null): boolean {
  const q = foldSearch(query);
  if (!q) return true;
  if (socioNumber !== null && q === String(socioNumber)) return true;
  return foldSearch(name).includes(q);
}

/** What the cash desk has taken since it opened: one count, and the money per method. */
export interface DeskTally {
  count: number;
  byMethod: Partial<Record<CuotaPaymentMethod, number>>;
}

export const EMPTY_TALLY: DeskTally = { count: 0, byMethod: {} };

export function addToTally(tally: DeskTally, method: CuotaPaymentMethod, cents: number): DeskTally {
  return { count: tally.count + 1, byMethod: { ...tally.byMethod, [method]: (tally.byMethod[method] ?? 0) + cents } };
}
