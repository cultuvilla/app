import { actaHeading } from '@cultuvilla/shared/export/recordsExport';
import { compareActas } from '@cultuvilla/shared/models/organization';
import type { Acta } from '@cultuvilla/shared/services/recordsService';

export interface AgreementItem {
  key: string;
  actaId: string;
  /** The agreement — or, for an acta that records none, the acta's own heading. */
  text: string;
  /** Where it was agreed: the acta's heading. Null when `text` already is the heading. */
  source: string | null;
  heldOn: string;
  isAsamblea: boolean;
}

export interface AgreementYear {
  year: string;
  items: AgreementItem[];
}

function folded(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * The actas' agreements as one timeline, newest acta first and grouped by the
 * year it was held. An acta without agreements still appears once, so a socio
 * can reach every acta the junta shared from here.
 */
export function agreementTimeline(actas: readonly Acta[], query = ''): AgreementYear[] {
  const needle = folded(query);
  const years: AgreementYear[] = [];
  for (const acta of [...actas].sort(compareActas)) {
    const heading = actaHeading(acta);
    const base = { actaId: acta.id, heldOn: acta.heldOn, isAsamblea: acta.body === 'asamblea_general' };
    const items: AgreementItem[] =
      acta.agreements.length > 0
        ? acta.agreements.map((text, i) => ({ ...base, key: `${acta.id}-${String(i)}`, text, source: heading }))
        : [{ ...base, key: `${acta.id}-0`, text: heading, source: null }];
    const matching = needle ? items.filter((item) => folded(`${item.text} ${item.source ?? ''}`).includes(needle)) : items;
    if (matching.length === 0) continue;
    const year = acta.heldOn.slice(0, 4);
    const last = years.at(-1);
    if (last?.year === year) last.items.push(...matching);
    else years.push({ year, items: matching });
  }
  return years;
}
