import { deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { getVillageSlug } from './municipalityService';
import { historyEntriesCollection, historyEntryDoc } from '../firebase/refs/client';
import {
  buildHistoryEntryData,
  buildHistoryEntryPatch,
  type HistoryEntryData,
  type HistoryEntryDataInput,
} from '../models/history/HistoryEntryDataModel';
import { watchDoc, watchQuery, type Unwatch, type WatchError } from './watch';

export type HistoryEntryWithId = HistoryEntryData & { id: string };

/** Mint an id up front so the gallery images can be uploaded under it before the doc write. */
export function newHistoryEntryId(): string {
  return doc(historyEntriesCollection(getDb())).id;
}

/** Any village member adds an entry; it lands `active` and is public at once.
 *  Village/app admins can hide it afterward via `moderationService`. */
export async function createHistoryEntry(
  input: Omit<HistoryEntryDataInput, 'villageSlug'>,
  id: string = newHistoryEntryId(),
): Promise<string> {
  const villageSlug = await getVillageSlug(input.municipalityId);
  await setDoc(historyEntryDoc(getDb(), id), buildHistoryEntryData({ ...input, villageSlug }));
  return id;
}

/**
 * A pueblo's whole timeline, newest first. Unpaginated on purpose: a village's
 * recorded history is tens of entries, and the timeline needs all of them to
 * place its century dividers.
 */
function historyEntriesQuery(municipalityId: string) {
  return query(
    historyEntriesCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    where('status', '==', 'active'),
    orderBy('sortKey', 'desc'),
  );
}

export async function getHistoryEntries(municipalityId: string): Promise<HistoryEntryWithId[]> {
  const snap = await getDocs(historyEntriesQuery(municipalityId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchHistoryEntries(
  municipalityId: string,
  onNext: (entries: HistoryEntryWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(historyEntriesQuery(municipalityId), onNext, onError);
}

export async function getHistoryEntry(entryId: string): Promise<HistoryEntryWithId | null> {
  const snap = await getDoc(historyEntryDoc(getDb(), entryId));
  const data = snap.data();
  return data ? { id: snap.id, ...data } : null;
}

export function watchHistoryEntry(
  entryId: string,
  onNext: (entry: HistoryEntryWithId | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(historyEntryDoc(getDb(), entryId), onNext, onError);
}

export function updateHistoryEntry(
  entryId: string,
  patch: Parameters<typeof buildHistoryEntryPatch>[0],
): Promise<void> {
  // Untyped ref: a patch is a partial write, which the full-model converter would reject.
  return updateDoc(doc(getDb(), 'historyEntries', entryId), buildHistoryEntryPatch(patch));
}

export function deleteHistoryEntry(entryId: string): Promise<void> {
  return deleteDoc(historyEntryDoc(getDb(), entryId));
}
