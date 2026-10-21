// packages/shared/src/services/recordsService.ts
import { deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import {
  organizationActasCollection,
  organizationLedgerEntriesCollection,
  organizationRecordsWriteDoc,
} from '../firebase/refs/client';
import {
  ActaDataSchema,
  buildActaData,
  buildActaFields,
  buildLedgerEntryData,
  buildLedgerReversalData,
  LedgerEntryDataSchema,
  ledgerReversalIdFor,
  type ActaData,
  type ActaInput,
  type LedgerEntryData,
  type LedgerEntryInput,
} from '../models/organization/RecordsDataModel';
import { yearDayRange } from '../models/organization/recordsLogic';
import { watchQuery, type Unwatch, type WatchError } from './watch';

export type Acta = ActaData & { id: string };
export type LedgerEntry = LedgerEntryData & { id: string };

// Writes go through unconverted refs so the server stamps the time
// (`serverTimestamp()`, which rules check against `request.time`); the strict
// schema still validates each payload first, with a stand-in Date.
const rawDoc = (orgId: string, collection: 'actas' | 'ledgerEntries', id: string) =>
  organizationRecordsWriteDoc(getDb(), orgId, collection, id);

// =============================================================================
// ACTAS
// =============================================================================

/** Admin: every acta of the group. Sort with `compareActas`. */
export function watchActas(orgId: string, onNext: (rows: Acta[]) => void, onError: WatchError): Unwatch {
  return watchQuery(organizationActasCollection(getDb(), orgId), onNext, onError);
}

/** Member: the actas the admins shared with the socios — the only ones rules let a member read. */
export function watchSocioVisibleActas(orgId: string, onNext: (rows: Acta[]) => void, onError: WatchError): Unwatch {
  return watchQuery(query(organizationActasCollection(getDb(), orgId), where('visibleToSocios', '==', true)), onNext, onError);
}

/** Admin: write a new acta. Returns its id. */
export async function createActa(orgId: string, input: ActaInput, adminUid: string): Promise<string> {
  const data = ActaDataSchema.parse(buildActaData({ ...input, createdBy: adminUid }));
  const id = doc(organizationActasCollection(getDb(), orgId)).id;
  await setDoc(rawDoc(orgId, 'actas', id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return id;
}

/** Admin: correct an acta, or share it with the socios. Who wrote it first stays. */
export async function updateActa(orgId: string, actaId: string, input: ActaInput, adminUid: string): Promise<void> {
  const fields = ActaDataSchema.omit({ createdBy: true, createdAt: true, updatedBy: true, updatedAt: true }).parse(buildActaFields(input));
  await updateDoc(rawDoc(orgId, 'actas', actaId), { ...fields, updatedBy: adminUid, updatedAt: serverTimestamp() });
}

/** Admin. */
export async function deleteActa(orgId: string, actaId: string): Promise<void> {
  await deleteDoc(rawDoc(orgId, 'actas', actaId));
}

// =============================================================================
// LEDGER — income and expenses beyond the cuota, append-only
// =============================================================================

/** Admin: the entries dated in one calendar year, reversals included (a reversal keeps its entry's day). */
export function watchLedgerEntriesForYear(
  orgId: string,
  year: string,
  onNext: (rows: LedgerEntry[]) => void,
  onError: WatchError,
): Unwatch {
  const { from, to } = yearDayRange(year);
  return watchQuery(
    query(organizationLedgerEntriesCollection(getDb(), orgId), where('on', '>=', from), where('on', '<=', to)),
    onNext,
    onError,
  );
}

/** Admin: record an income or an expense. Returns the entry id. Entries are never edited — see `reverseLedgerEntry`. */
export async function recordLedgerEntry(
  orgId: string,
  input: Omit<LedgerEntryInput, 'recordedBy' | 'recordedAt'>,
  adminUid: string,
): Promise<string> {
  const data = LedgerEntryDataSchema.parse(buildLedgerEntryData({ ...input, recordedBy: adminUid }));
  const id = doc(organizationLedgerEntriesCollection(getDb(), orgId)).id;
  await setDoc(rawDoc(orgId, 'ledgerEntries', id), { ...data, recordedAt: serverTimestamp() });
  return id;
}

/** Admin: cancel a wrong entry with a reversing one at `rev_<id>`, so an entry is reversed at most once. */
export async function reverseLedgerEntry(orgId: string, entry: LedgerEntry, adminUid: string): Promise<void> {
  if (entry.reversesId !== null) throw new Error('A reversal cannot be reversed');
  const data = LedgerEntryDataSchema.parse(buildLedgerReversalData(entry, { recordedBy: adminUid }));
  await setDoc(rawDoc(orgId, 'ledgerEntries', ledgerReversalIdFor(entry.id)), { ...data, recordedAt: serverTimestamp() });
}
