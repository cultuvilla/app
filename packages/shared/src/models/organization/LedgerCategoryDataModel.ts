import { z } from 'zod';
import { LedgerEntryKindSchema, type LedgerEntryKind } from './RecordsDataModel';

/**
 * A ledger category the group's admins keep, at
 * `organizations/{orgId}/ledgerCategories/{categoryId}`: a name and whether it
 * labels gastos or ingresos. An entry stores the category's NAME as a snapshot
 * (`LedgerEntryData.category`), never a pointer, so renaming or deleting one
 * changes only the entries noted afterwards — the books already written stay
 * as the asamblea approved them.
 *
 * The id is derived from kind + name (`ledgerCategoryIdFor`), so one name per
 * kind exists once whatever its case, and a create works offline without
 * reading the list first.
 */

/** Same cap as `LedgerEntryData.category`, which stores the name. */
export const MAX_LEDGER_CATEGORY_NAME = 60;

export const LedgerCategoryDataSchema = z.object({
  name: z.string().min(1).max(MAX_LEDGER_CATEGORY_NAME),
  kind: LedgerEntryKindSchema,
  createdBy: z.string(),
  createdAt: z.date(),
});
export type LedgerCategoryData = z.infer<typeof LedgerCategoryDataSchema>;

/** Trimmed, inner whitespace collapsed — how a typed name is stored. */
export function cleanLedgerCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** The key two names share when they differ only in case or spacing. */
export function ledgerCategoryKey(name: string): string {
  return cleanLedgerCategoryName(name).toLowerCase();
}

/**
 * `<kind>_<encoded lowercase name>`. A 60-char name encodes to at most 720
 * bytes, well under Firestore's 1500-byte id limit; the prefix keeps the id off
 * the reserved `.`, `..` and `__…__` forms, and encoding removes any `/`.
 */
export function ledgerCategoryIdFor(kind: LedgerEntryKind, name: string): string {
  return `${kind}_${encodeURIComponent(ledgerCategoryKey(name))}`;
}

export function buildLedgerCategoryData(input: {
  name: string;
  kind: LedgerEntryKind;
  createdBy: string;
  createdAt?: Date;
}): LedgerCategoryData {
  return {
    name: cleanLedgerCategoryName(input.name),
    kind: input.kind,
    createdBy: input.createdBy,
    createdAt: input.createdAt ?? new Date(),
  };
}

export interface LedgerCategoryChoice {
  name: string;
  /** False for a name only past entries carry; picking it adds it to the list. */
  stored: boolean;
}

/**
 * What the entry sheet offers for one kind: the stored categories, then the
 * names past entries of that kind used that the list does not hold yet — each
 * once, case-insensitively, alphabetical within each group.
 */
export function ledgerCategoryChoices(
  categories: readonly Pick<LedgerCategoryData, 'name' | 'kind'>[],
  pastEntries: readonly { kind: LedgerEntryKind; category: string | null }[],
  kind: LedgerEntryKind,
): LedgerCategoryChoice[] {
  const byName = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
  const seen = new Set<string>();
  const stored: string[] = [];
  for (const c of categories) {
    if (c.kind !== kind || seen.has(ledgerCategoryKey(c.name))) continue;
    seen.add(ledgerCategoryKey(c.name));
    stored.push(c.name);
  }
  const past: string[] = [];
  for (const e of pastEntries) {
    if (e.kind !== kind || e.category === null) continue;
    const name = cleanLedgerCategoryName(e.category);
    if (name === '' || seen.has(ledgerCategoryKey(name))) continue;
    seen.add(ledgerCategoryKey(name));
    past.push(name);
  }
  return [
    ...stored.sort(byName).map((name) => ({ name, stored: true })),
    ...past.sort(byName).map((name) => ({ name, stored: false })),
  ];
}
