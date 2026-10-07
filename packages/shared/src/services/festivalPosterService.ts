import { getVillageSlug } from './municipalityService';
import {
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { festivalPostersCollection, festivalPosterDoc } from '../firebase/refs/client';
import {
  buildFestivalPosterData,
  type FestivalPosterData,
  type FestivalPosterDataInput,
} from '../models/festivalPoster/FestivalPosterDataModel';
import { watchDoc, watchQuery, type Unwatch, type WatchError } from './watch';

export type FestivalPosterWithId = FestivalPosterData & { id: string };

/** Mint an id up front so the poster image can be uploaded before the doc write. */
export function newFestivalPosterId(): string {
  return doc(festivalPostersCollection(getDb())).id;
}

async function writePoster(
  id: string,
  input: Omit<FestivalPosterDataInput, 'villageSlug'>,
): Promise<string> {
  const villageSlug = await getVillageSlug(input.municipalityId);
  await setDoc(festivalPosterDoc(getDb(), id), buildFestivalPosterData({ ...input, villageSlug }));
  return id;
}

/** Any village member adds a poster; it lands `active` and is visible to everyone
 *  immediately. Village/app admins can hide it afterward via `moderationService`. */
export function createFestivalPoster(
  input: Omit<FestivalPosterDataInput, 'villageSlug'>,
  id: string = newFestivalPosterId(),
): Promise<string> {
  return writePoster(id, input);
}

function festivalPostersQuery(municipalityId: string) {
  return query(
    festivalPostersCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    where('status', '==', 'active'),
    orderBy('year', 'desc'),
  );
}

export async function getFestivalPosters(municipalityId: string): Promise<FestivalPosterWithId[]> {
  const snap = await getDocs(festivalPostersQuery(municipalityId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchFestivalPosters(
  municipalityId: string,
  onNext: (posters: FestivalPosterWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(festivalPostersQuery(municipalityId), onNext, onError);
}

export async function getFestivalPoster(posterId: string): Promise<FestivalPosterWithId | null> {
  const snap = await getDoc(festivalPosterDoc(getDb(), posterId));
  const data = snap.data();
  return data ? { id: snap.id, ...data } : null;
}

export function watchFestivalPoster(
  posterId: string,
  onNext: (poster: FestivalPosterWithId | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(festivalPosterDoc(getDb(), posterId), onNext, onError);
}

export function updateFestivalPoster(
  posterId: string,
  patch: Partial<
    Pick<
      FestivalPosterData,
      'year' | 'title' | 'images' | 'datePrecision' | 'startsAt' | 'endsAt' | 'contributorUserIds' | 'contributorOrgIds'
    >
  >,
): Promise<void> {
  return updateDoc(doc(getDb(), 'festivalPosters', posterId), patch);
}

export function deleteFestivalPoster(posterId: string): Promise<void> {
  return deleteDoc(festivalPosterDoc(getDb(), posterId));
}
