export type FeedTab = 'eventos' | 'noticias';
export type DatePreset = 'hoy' | 'semana' | 'mes';

/** Explora's filters. null/'' = unset. */
export interface FeedFilterState {
  search: string;
  villageId: string | null;
  date: DatePreset | null;
  category: string | null;
}

/**
 * True when a filter that can hide rows applies to `tab`'s feed — so an empty
 * feed means "nothing matches", not "nothing exists". The date filter only
 * narrows events and the category only news; the proximity sort hides nothing.
 */
export function hasActiveFeedFilter(tab: FeedTab, f: FeedFilterState): boolean {
  if (f.search.trim().length > 0 || f.villageId !== null) return true;
  return tab === 'eventos' ? f.date !== null : f.category !== null;
}
