import {
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  serverTimestamp,
  increment,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { occupationsCollection } from '../firebase/refs/client';
import type { OccupationData } from '../models/occupation/OccupationDataModel';

/**
 * Lowercase, trim, fold accents, and collapse internal whitespace to a
 * single dash — used as the /occupations/{slug} doc id so differently
 * cased/accented entries of the same occupation collide onto one doc.
 */
export function slugifyOccupation(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/**
 * Records a free-text occupation entry, upserting occupations/{slug} and
 * bumping its count. Idempotent doc id, safe to call on every submission.
 */
export async function recordOccupation(name: string): Promise<void> {
  const slug = slugifyOccupation(name);
  // setDoc with FieldValue sentinels (increment/serverTimestamp) bypasses the
  // typed converter's strict schema.parse — write through the raw doc ref.
  // typed-refs: allowed
  const ref = doc(getDb(), 'occupations', slug);
  await setDoc(
    ref,
    {
      name,
      count: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Collected occupations, for suggestions/autocomplete. */
export async function getOccupations(): Promise<(OccupationData & { id: string })[]> {
  const q = query(occupationsCollection(getDb()), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
