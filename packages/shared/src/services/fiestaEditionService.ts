import { getVillageSlug } from './municipalityService';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { fiestaEditionDoc, fiestaEditionsCollection } from '../firebase/refs/client';
import {
  buildFiestaEditionData,
  fiestaEditionId,
  type FiestaEdition,
} from '../models/fiesta/FiestaEditionModel';
import type { DayKey } from '../models/municipality/FiestaBlockModel';
import { watchQuery, type Unwatch, type WatchError } from './watch';

function villageEditionsQuery(municipalityId: string) {
  return query(
    fiestaEditionsCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    orderBy('startDay', 'asc'),
  );
}

/** Every edition a village has dated, oldest first. A handful per year, so never paged. */
export async function getFiestaEditions(municipalityId: string): Promise<FiestaEdition[]> {
  const snap = await getDocs(villageEditionsQuery(municipalityId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchFiestaEditions(
  municipalityId: string,
  onNext: (editions: FiestaEdition[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(villageEditionsQuery(municipalityId), onNext, onError);
}

export async function getFiestaEdition(editionId: string): Promise<FiestaEdition | null> {
  const snap = await getDoc(fiestaEditionDoc(getDb(), editionId));
  const data = snap.data();
  return data ? { id: snap.id, ...data } : null;
}

export interface SaveFiestaEditionInput {
  municipalityId: string;
  blockId: string;
  year: number;
  startDay: DayKey;
  endDay: DayKey;
  /** The signed-in user — recorded as the proposer when the edition is new. */
  uid: string;
}

/**
 * Date a block for a year: proposes the edition when there is none, otherwise
 * corrects its days. The id is fixed per block and year, so this never makes a
 * second edition; who may correct one is firestore.rules' call (the proposer
 * and the village's admins).
 */
export async function saveFiestaEdition(input: SaveFiestaEditionInput): Promise<string> {
  const id = fiestaEditionId(input.municipalityId, input.blockId, input.year);
  const existing = await getDoc(fiestaEditionDoc(getDb(), id));
  if (existing.exists()) {
    await updateDoc(doc(getDb(), 'fiestaEditions', id), { startDay: input.startDay, endDay: input.endDay, updatedAt: serverTimestamp() });
    return id;
  }
  const villageSlug = await getVillageSlug(input.municipalityId);
  await setDoc(
    fiestaEditionDoc(getDb(), id),
    buildFiestaEditionData({
      municipalityId: input.municipalityId,
      villageSlug,
      blockId: input.blockId,
      year: input.year,
      startDay: input.startDay,
      endDay: input.endDay,
      proposedBy: input.uid,
    }),
  );
  return id;
}

/** Events tagged to it keep their id; the programme they were in is simply gone. */
export function deleteFiestaEdition(editionId: string): Promise<void> {
  return deleteDoc(fiestaEditionDoc(getDb(), editionId));
}
