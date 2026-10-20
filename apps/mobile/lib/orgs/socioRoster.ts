import { isActiveSocio } from '@cultuvilla/shared/models/organization';
import type { Socio } from '@cultuvilla/shared/services/socioService';

/** The rows a roster list shows: active ones first by name, then the bajas when asked. */
export function visibleSocios(rows: Socio[], showBajas: boolean): Socio[] {
  const byName = (a: Socio, b: Socio) => a.displayName.localeCompare(b.displayName);
  const active = rows.filter(isActiveSocio).sort(byName);
  if (!showBajas) return active;
  return [...active, ...rows.filter((r) => !isActiveSocio(r)).sort(byName)];
}

/** Members a typed-in socio may be merged into: active rows of app users. */
export function linkCandidates(rows: Socio[]): Socio[] {
  return rows.filter((r) => r.kind === 'member' && r.uid !== null && isActiveSocio(r));
}

/** The name of the member answerable for a persona row, from the roster itself. */
export function responsibleName(row: Socio, rows: Socio[]): string | null {
  if (row.kind !== 'persona' || !row.responsibleUid) return null;
  return rows.find((r) => r.uid === row.responsibleUid && isActiveSocio(r))?.displayName ?? null;
}
