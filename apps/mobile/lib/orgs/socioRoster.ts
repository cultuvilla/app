import { isActiveSocio, type SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import type { Socio } from '@cultuvilla/shared/services/socioService';

/** Members a typed-in socio may be merged into: active rows of app users. */
export function linkCandidates(rows: Socio[]): Socio[] {
  return rows.filter((r) => r.kind === 'member' && r.uid !== null && isActiveSocio(r));
}

/** The name of the member answerable for a persona row, from the roster itself. */
export function responsibleName(row: Socio, rows: Socio[]): string | null {
  if (row.kind !== 'persona' || !row.responsibleUid) return null;
  return rows.find((r) => r.uid === row.responsibleUid && isActiveSocio(r))?.displayName ?? null;
}

/** The book's filter chips. `pendiente` and `sinApp` look at active socios only. */
export type BookFilter = 'activos' | 'pendiente' | 'sinApp' | 'bajas';

/** Whom the treasurer should call: unpaid on their own account, not covered by a household. */
export function owesCuota(status: SocioCuotaStatus | undefined): boolean {
  return !!status && status.status !== 'al_dia' && status.basis !== 'household';
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** A name containing the query (accents and case aside), or the exact socio number. */
export function matchesSocioQuery(row: Socio, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  if (/^\d+$/.test(q)) return row.socioNumber !== null && String(row.socioNumber) === q;
  return fold(row.displayName).includes(q);
}

function inFilter(row: Socio, filter: BookFilter, statuses: ReadonlyMap<string, SocioCuotaStatus>): boolean {
  const active = isActiveSocio(row);
  switch (filter) {
    case 'activos':
      return active;
    case 'pendiente':
      return active && owesCuota(statuses.get(row.id));
    case 'sinApp':
      return active && row.kind === 'typed';
    case 'bajas':
      return !active;
  }
}

/** How many socios each chip holds. */
export function bookCounts(rows: Socio[], statuses: ReadonlyMap<string, SocioCuotaStatus>): Record<BookFilter, number> {
  const count = (f: BookFilter) => rows.filter((r) => inFilter(r, f, statuses)).length;
  return { activos: count('activos'), pendiente: count('pendiente'), sinApp: count('sinApp'), bajas: count('bajas') };
}

/** The book under one chip and a search, by name. */
export function filterBook(
  rows: Socio[],
  filter: BookFilter,
  query: string,
  statuses: ReadonlyMap<string, SocioCuotaStatus>,
): Socio[] {
  return rows
    .filter((r) => inFilter(r, filter, statuses) && matchesSocioQuery(r, query))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
}

/** Initials for a face without a photo: "María López" → "ML". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}
