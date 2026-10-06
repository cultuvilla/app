import {
  addDoc,
  deleteDoc,
  doc,
  limit,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import {
  vocabularyTermsCollection,
  vocabularyTermDoc,
  vocabularyDefinitionsCollection,
  vocabularyDefinitionDoc,
  vocabularyWordsCollection,
  vocabularyWordDoc,
} from '../firebase/refs/client';
import {
  buildVocabularyTermData,
  slugifyTerm,
  vocabularyTermId,
  type VocabularyTermData,
  type VocabularyTermKind,
} from '../models/vocabulary/VocabularyTermDataModel';
import type { VocabularyWordData } from '../models/vocabulary/VocabularyWordDataModel';
import {
  buildVocabularyDefinitionData,
  type VocabularyDefinitionData,
  type VocabularyDefinitionDataInput,
} from '../models/vocabulary/VocabularyDefinitionDataModel';
import { watchDoc, watchQuery, type Unwatch, type WatchError } from './watch';

export type VocabularyTermWithId = VocabularyTermData & { id: string };
export type VocabularyWordWithId = VocabularyWordData & { id: string };
export type VocabularyDefinitionWithId = VocabularyDefinitionData & { id: string };

// ── Terms ────────────────────────────────────────────────────────────────

export async function getVocabularyTerm(termId: string): Promise<VocabularyTermWithId | null> {
  const snap = await getDoc(vocabularyTermDoc(getDb(), termId));
  const data = snap.data();
  return data ? { id: snap.id, ...data } : null;
}

export function watchVocabularyTerm(
  termId: string,
  onNext: (term: VocabularyTermWithId | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(vocabularyTermDoc(getDb(), termId), onNext, onError);
}

/**
 * Every active term in a pueblo, alphabetically.
 *
 * Deliberately unpaginated and unfiltered: a village glossary is tens to a few
 * hundred headwords, so the list screen holds the whole thing and filters the
 * search box in memory. A server-side prefix query would cost an extra index
 * and a round trip per keystroke to search a list that already fits in one.
 */
function vocabularyTermsQuery(municipalityId: string) {
  return query(
    vocabularyTermsCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    where('status', '==', 'active'),
    orderBy('normalized', 'asc'),
  );
}

export async function getVocabularyTerms(municipalityId: string): Promise<VocabularyTermWithId[]> {
  const snap = await getDocs(vocabularyTermsQuery(municipalityId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchVocabularyTerms(
  municipalityId: string,
  onNext: (terms: VocabularyTermWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(vocabularyTermsQuery(municipalityId), onNext, onError);
}

/**
 * Create the term doc unless it already exists, and return its id.
 *
 * The id is derived from the headword, so this is the point where "esbardo,
 * added by Ana" and "Esbardo, added by Luis a minute later" converge. The
 * existence check races: both clients can read "missing" and both can write.
 * The loser's `setDoc` lands on an existing doc, which Firestore rules evaluate
 * as an *update* — and the update rule freezes `createdBy`/`createdAt`/the
 * counters, so it is denied rather than silently resetting Ana's term. Treating
 * that denial as success is correct: the doc the caller asked for now exists.
 */
export async function ensureVocabularyTerm(input: {
  municipalityId: string;
  term: string;
  kind: VocabularyTermKind;
  createdBy: string;
  contributorUserIds?: string[];
  contributorOrgIds?: string[];
}): Promise<string> {
  const id = vocabularyTermId(input.municipalityId, input.term);
  const ref = vocabularyTermDoc(getDb(), id);
  const existing = await getDoc(ref);
  if (existing.exists()) return id;

  try {
    await setDoc(ref, buildVocabularyTermData(input));
  } catch (err) {
    const stillMissing = !(await getDoc(ref)).exists();
    if (stillMissing) throw err;
  }
  return id;
}

/**
 * Add a headword together with its first meaning — the single action the "añadir
 * palabra" form performs. Returns the term id so the caller can navigate to it.
 *
 * One digitization credit feeds both writes. When the word is new it credits the
 * word and its meaning; when somebody recorded the word first, the term keeps its
 * original credit (it is immutable) and this credit lands on the new meaning only.
 */
export async function addVocabularyEntry(input: {
  municipalityId: string;
  term: string;
  kind: VocabularyTermKind;
  createdBy: string;
  contributorUserIds?: string[];
  contributorOrgIds?: string[];
  definition: string;
  example?: string | null;
  castellano?: string | null;
}): Promise<string> {
  const termId = await ensureVocabularyTerm(input);
  await addVocabularyDefinition({
    municipalityId: input.municipalityId,
    termId,
    definition: input.definition,
    example: input.example ?? null,
    castellano: input.castellano ?? null,
    createdBy: input.createdBy,
    contributorUserIds: input.contributorUserIds,
    contributorOrgIds: input.contributorOrgIds,
  });
  return termId;
}

/**
 * Remove a headword. Only ever correct once its last definition is gone —
 * `firestore.rules` enforces that for the author, and lets village admins
 * delete regardless (their lever for a term that should not exist at all).
 */
export function deleteVocabularyTerm(termId: string): Promise<void> {
  return deleteDoc(vocabularyTermDoc(getDb(), termId));
}

// ── Definitions ──────────────────────────────────────────────────────────

function vocabularyDefinitionsQuery(termId: string) {
  return query(
    vocabularyDefinitionsCollection(getDb()),
    where('termId', '==', termId),
    where('status', '==', 'active'),
    orderBy('createdAt', 'asc'),
  );
}

export async function getVocabularyDefinitions(
  termId: string,
): Promise<VocabularyDefinitionWithId[]> {
  const snap = await getDocs(vocabularyDefinitionsQuery(termId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchVocabularyDefinitions(
  termId: string,
  onNext: (definitions: VocabularyDefinitionWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(vocabularyDefinitionsQuery(termId), onNext, onError);
}

/**
 * Every active meaning in a pueblo, in one query — for the list screen's
 * per-row credit, which would otherwise cost a read per headword. Same
 * whole-glossary reasoning as `getVocabularyTerms`.
 */
function villageVocabularyDefinitionsQuery(municipalityId: string) {
  return query(
    vocabularyDefinitionsCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    where('status', '==', 'active'),
  );
}

export async function getVillageVocabularyDefinitions(
  municipalityId: string,
): Promise<VocabularyDefinitionWithId[]> {
  const snap = await getDocs(villageVocabularyDefinitionsQuery(municipalityId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchVillageVocabularyDefinitions(
  municipalityId: string,
  onNext: (definitions: VocabularyDefinitionWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(villageVocabularyDefinitionsQuery(municipalityId), onNext, onError);
}

export async function addVocabularyDefinition(
  input: VocabularyDefinitionDataInput,
): Promise<string> {
  const ref = await addDoc(
    vocabularyDefinitionsCollection(getDb()),
    buildVocabularyDefinitionData(input),
  );
  return ref.id;
}

/**
 * The typed `UpdateData<T>` distribution chokes on a patch that mixes nullable
 * fields with the update sentinels, so this one write goes through the raw doc
 * ref (the documented pairing in AGENTS.md / `check-no-raw-firestore-refs`).
 */
export function updateVocabularyDefinition(
  definitionId: string,
  patch: Pick<VocabularyDefinitionData, 'definition' | 'example' | 'castellano'>,
): Promise<void> {
  return updateDoc(doc(getDb(), 'vocabularyDefinitions', definitionId), { ...patch, updatedAt: new Date() });
}

export function deleteVocabularyDefinition(definitionId: string): Promise<void> {
  return deleteDoc(vocabularyDefinitionDoc(getDb(), definitionId));
}

// ── The shared word index ────────────────────────────────────────────────
// One doc per word across every village, maintained by
// `syncVocabularyWordIndex`. Read-only from the client.

/** How many suggestions the "añadir palabra" form offers while you type. */
export const VOCABULARY_SUGGESTION_LIMIT = 8;

/**
 * Words already recorded anywhere that start with what the villager is typing.
 *
 * Firestore has no substring search, so this is a prefix range on `normalized`:
 * `\uf8ff` is the last character in the BMP, so `[q, q + \uf8ff]` spans exactly
 * the words beginning with `q`. Ordering by the same field keeps it a
 * single-field index, so no composite index is needed.
 *
 * The query is folded the same way the ids are, so typing "napa" finds "ñapa"
 * and "ESBARDO" finds "esbardo".
 */
export async function searchVocabularyWords(
  prefix: string,
  max: number = VOCABULARY_SUGGESTION_LIMIT,
): Promise<VocabularyWordWithId[]> {
  const needle = slugifyTerm(prefix);
  if (!needle) return [];
  const q = query(
    vocabularyWordsCollection(getDb()),
    where('normalized', '>=', needle),
    where('normalized', '<=', `${needle}\uf8ff`),
    orderBy('normalized', 'asc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getVocabularyWord(slug: string): Promise<VocabularyWordWithId | null> {
  const snap = await getDoc(vocabularyWordDoc(getDb(), slug));
  const data = snap.data();
  return data ? { id: snap.id, ...data } : null;
}

/**
 * Every village that records this word, the current one excluded — the
 * "también se dice en…" list on a word screen.
 *
 * Reads the village entries rather than the index, because the index counts
 * villages without naming them; naming them is what makes the section useful.
 */
export async function getVillagesSayingTerm(
  normalized: string,
  exceptMunicipalityId: string,
): Promise<VocabularyTermWithId[]> {
  const q = query(
    vocabularyTermsCollection(getDb()),
    where('normalized', '==', normalized),
    where('status', '==', 'active'),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.municipalityId !== exceptMunicipalityId);
}
