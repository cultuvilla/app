import {
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { censoAnswersCollection, censoAnswersDoc } from '../firebase/refs/client';
import type { ProfileAnswers, ProfileFormField } from '../models/municipality/CensoTypes';
import { buildCensoAnswersData, type CensoAnswersData } from '../models/municipality/CensoAnswersDataModel';
import { isCensoComplete } from './censoService';

/**
 * Saves the user's answers to a municipality's censo. The answers go to the
 * private censoAnswers doc; the world-readable member doc only records whether
 * the censo is complete (profileCompletedAt), set when every required field is
 * filled and cleared otherwise. One batch, so the two never disagree.
 *
 * Only the user themselves should call this (security rules enforce that).
 */
export async function saveProfileAnswers(
  municipalityId: string,
  userId: string,
  fields: ProfileFormField[],
  answers: ProfileAnswers,
): Promise<void> {
  const db = getDb();
  const complete = isCensoComplete(fields, answers);
  const batch = writeBatch(db);
  batch.set(
    censoAnswersDoc(db, municipalityId, userId),
    buildCensoAnswersData({ municipalityId, userId, profileAnswers: answers }),
  );
  // Raw ref: the typed UpdateData chokes on the FieldValue | null union.
  batch.update(doc(db, 'municipalities', municipalityId, 'members', userId), {
    profileCompletedAt: complete ? serverTimestamp() : null,
  });
  await batch.commit();
}

/** The signed-in user's own answers for one village; `{}` when never answered. */
export async function getMyCensoAnswers(
  municipalityId: string,
  userId: string,
): Promise<ProfileAnswers> {
  const snap = await getDoc(censoAnswersDoc(getDb(), municipalityId, userId));
  return snap.exists() ? snap.data().profileAnswers : {};
}

/** Every villager's answers for one village. Village admins and app admins only. */
export async function getVillageCensoAnswers(municipalityId: string): Promise<CensoAnswersData[]> {
  const snap = await getDocs(
    query(censoAnswersCollection(getDb()), where('municipalityId', '==', municipalityId)),
  );
  return snap.docs.map((d) => d.data());
}

/**
 * Aggregates predefined-field answers across all members of a municipality,
 * returning a map of `{ key -> Set<value> }`. Useful as input to schema
 * transition validation. Reading the full members collection is fine for
 * a single-village admin operation; not used in hot paths.
 */
export function collectUsedValues(
  members: { profileAnswers: ProfileAnswers }[],
): Record<string, Set<string | number | boolean>> {
  const out: Record<string, Set<string | number | boolean>> = {};
  for (const m of members) {
    for (const [k, v] of Object.entries(m.profileAnswers)) {
      // Lazy-init the bucket. Cast through `unknown | undefined` because the
      // index signature elides `| undefined` here (apps/mobile compiles with
      // noUncheckedIndexedAccess, so consumers do see the union).
      let bucket = (out as Record<string, Set<string | number | boolean> | undefined>)[k];
      if (bucket === undefined) {
        bucket = new Set();
        out[k] = bucket;
      }
      if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === 'string') bucket.add(item);
        }
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        if (v !== '') bucket.add(v);
      }
    }
  }
  return out;
}

/**
 * Counts, per field key, how many members hold a non-empty answer. Empty
 * strings and empty arrays do not count. Used to warn the admin how many
 * answers a question deletion will erase.
 */
export function answeredCountByKey(
  members: { profileAnswers: ProfileAnswers }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of members) {
    for (const [k, v] of Object.entries(m.profileAnswers)) {
      const has = Array.isArray(v) ? v.length > 0 : v !== '';
      if (has) out[k] = (out[k] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * Marks profileCompletedAt by converting the Firestore Timestamp on read.
 * Helper for callers that need a Date.
 */
export function profileCompletedAtToDate(
  raw: unknown,
): Date | null {
  return raw instanceof Timestamp ? raw.toDate() : null;
}
