// packages/shared/src/services/ledgerCategoryService.ts
import { deleteDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { organizationLedgerCategoriesCollection, organizationRecordsWriteDoc } from '../firebase/refs/client';
import {
  buildLedgerCategoryData,
  cleanLedgerCategoryName,
  LedgerCategoryDataSchema,
  ledgerCategoryIdFor,
  type LedgerCategoryData,
} from '../models/organization/LedgerCategoryDataModel';
import type { LedgerEntryKind } from '../models/organization/RecordsDataModel';
import { watchQuery, type Unwatch, type WatchError } from './watch';

export type LedgerCategory = LedgerCategoryData & { id: string };

const rawDoc = (orgId: string, id: string) => organizationRecordsWriteDoc(getDb(), orgId, 'ledgerCategories', id);

/** Admin: every category of the group, both kinds. Filter with `ledgerCategoryChoices`. */
export function watchLedgerCategories(orgId: string, onNext: (rows: LedgerCategory[]) => void, onError: WatchError): Unwatch {
  return watchQuery(organizationLedgerCategoriesCollection(getDb(), orgId), onNext, onError);
}

function stampedPayload(name: string, kind: LedgerEntryKind, adminUid: string) {
  const data = LedgerCategoryDataSchema.parse(buildLedgerCategoryData({ name, kind, createdBy: adminUid }));
  return { ...data, createdAt: serverTimestamp() };
}

/**
 * Admin: add a category. Returns its id, which kind + name decide, so the same
 * name in another case is the same category. The caller checks the list first
 * (`ledgerCategoryChoices`): rules refuse to overwrite an existing one.
 */
export async function createLedgerCategory(
  orgId: string,
  input: { kind: LedgerEntryKind; name: string },
  adminUid: string,
): Promise<string> {
  const id = ledgerCategoryIdFor(input.kind, input.name);
  await setDoc(rawDoc(orgId, id), stampedPayload(input.name, input.kind, adminUid));
  return id;
}

/**
 * Admin: rename a category. Entries already noted keep the old name — they
 * hold a snapshot, not a pointer. A change of case only keeps the id and
 * rewrites the name; any other rename moves the category to the id of its new
 * name in one batch, so dedupe-by-id keeps holding.
 */
export async function renameLedgerCategory(orgId: string, category: LedgerCategory, name: string, adminUid: string): Promise<void> {
  const cleaned = cleanLedgerCategoryName(name);
  const nextId = ledgerCategoryIdFor(category.kind, cleaned);
  if (nextId === category.id) {
    const { name: parsed } = LedgerCategoryDataSchema.pick({ name: true }).parse({ name: cleaned });
    await updateDoc(rawDoc(orgId, category.id), { name: parsed });
    return;
  }
  const batch = writeBatch(getDb());
  batch.delete(rawDoc(orgId, category.id));
  batch.set(rawDoc(orgId, nextId), stampedPayload(cleaned, category.kind, adminUid));
  await batch.commit();
}

/** Admin. Entries noted with it keep its name. */
export async function deleteLedgerCategory(orgId: string, categoryId: string): Promise<void> {
  await deleteDoc(rawDoc(orgId, categoryId));
}
