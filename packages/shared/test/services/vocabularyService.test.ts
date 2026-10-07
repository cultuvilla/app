import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

// Lets a test make the next setDoc fail, optionally after landing a competing
// write — the "two villagers add the same word at once" race.
const setDocHook: { next: null | (() => void) } = { next: null };

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => {
  const m = createFakeFirestoreModule();
  let added = 0;
  return {
    ...m,
    query: vi.fn(m.query),
    setDoc: vi.fn((ref: { _id: string }, data: Record<string, unknown>) => {
      const hook = setDocHook.next;
      setDocHook.next = null;
      if (hook) {
        hook();
        return Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' }));
      }
      return m.setDoc(ref, data);
    }),
    addDoc: (col: { _col: string }, data: Record<string, unknown>) => {
      const ref = m.doc(col, `added${String(++added)}`) as { _id: string; id: string };
      return m.setDoc(ref, data).then(() => ref);
    },
  };
});

import { query, setDoc } from 'firebase/firestore';
import {
  addVocabularyEntry,
  ensureVocabularyTerm,
  getVillagesSayingTerm,
  getVocabularyTerm,
  searchVocabularyWords,
  VOCABULARY_SUGGESTION_LIMIT,
} from '../../src/services/vocabularyService';
import { vocabularyTermId } from '../../src/models/vocabulary/VocabularyTermDataModel';

function lastConstraints(): unknown[] {
  const calls = vi.mocked(query).mock.calls;
  return (calls[calls.length - 1] as unknown[]).slice(1);
}

const TERM_INPUT = { municipalityId: 'm1', term: 'esbardo', kind: 'palabra' as const, createdBy: 'ana' };

describe('vocabularyService', () => {
  beforeEach(() => {
    resetFakeFirestore();
    vi.mocked(query).mockClear();
    vi.mocked(setDoc).mockClear();
    setDocHook.next = null;
  });

  describe('ensureVocabularyTerm', () => {
    it('creates the term under its deterministic id', async () => {
      const id = await ensureVocabularyTerm(TERM_INPUT);
      expect(id).toBe(vocabularyTermId('m1', 'esbardo'));
      expect(fakeStore()[`vocabularyTerms/${id}`]).toMatchObject({
        municipalityId: 'm1',
        normalized: 'esbardo',
        createdBy: 'ana',
        status: 'active',
      });
    });

    it('converges spelling variants on one doc and never overwrites the first author', async () => {
      const first = await ensureVocabularyTerm(TERM_INPUT);
      const second = await ensureVocabularyTerm({ ...TERM_INPUT, term: 'Esbardo', createdBy: 'luis' });

      expect(second).toBe(first);
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect(fakeStore()[`vocabularyTerms/${first}`]).toMatchObject({ createdBy: 'ana' });
    });

    it('treats a denied write as success when a concurrent writer created the term', async () => {
      const id = vocabularyTermId('m1', 'esbardo');
      setDocHook.next = () => {
        fakeStore()[`vocabularyTerms/${id}`] = { municipalityId: 'm1', createdBy: 'luis' };
      };

      await expect(ensureVocabularyTerm(TERM_INPUT)).resolves.toBe(id);
      expect(fakeStore()[`vocabularyTerms/${id}`]).toMatchObject({ createdBy: 'luis' });
    });

    it('rethrows a denied write when the term still does not exist', async () => {
      setDocHook.next = () => undefined;
      await expect(ensureVocabularyTerm(TERM_INPUT)).rejects.toThrow('denied');
    });
  });

  it('addVocabularyEntry creates the term and its first meaning, linked by termId', async () => {
    const termId = await addVocabularyEntry({
      ...TERM_INPUT,
      definition: 'Tejón',
      contributorOrgIds: ['org1'],
    });

    expect(await getVocabularyTerm(termId)).toMatchObject({ id: termId, createdBy: 'ana' });
    const defs = Object.entries(fakeStore()).filter(([k]) => k.startsWith('vocabularyDefinitions/'));
    expect(defs).toHaveLength(1);
    expect(defs[0][1]).toMatchObject({
      municipalityId: 'm1',
      termId,
      definition: 'Tejón',
      example: null,
      castellano: null,
      createdBy: 'ana',
      contributorOrgIds: ['org1'],
    });
  });

  it('addVocabularyEntry adds a meaning to an existing term without re-crediting it', async () => {
    const termId = await ensureVocabularyTerm(TERM_INPUT);
    await addVocabularyEntry({ ...TERM_INPUT, createdBy: 'luis', definition: 'Persona huraña' });

    expect(fakeStore()[`vocabularyTerms/${termId}`]).toMatchObject({ createdBy: 'ana' });
    const defs = Object.values(fakeStore()).filter((d) => d['termId'] === termId);
    expect(defs).toEqual([expect.objectContaining({ createdBy: 'luis', definition: 'Persona huraña' })]);
  });

  describe('searchVocabularyWords', () => {
    it('returns nothing, without querying, for an empty or symbol-only prefix', async () => {
      await expect(searchVocabularyWords('')).resolves.toEqual([]);
      await expect(searchVocabularyWords('  ¡! ')).resolves.toEqual([]);
      expect(query).not.toHaveBeenCalled();
    });

    it('folds the prefix and range-queries the word index', async () => {
      await searchVocabularyWords('Ñapa');
      expect(lastConstraints()).toEqual([
        { _type: 'where', field: 'normalized', op: '>=', value: 'napa' },
        { _type: 'where', field: 'normalized', op: '<=', value: 'napa' },
        { _type: 'orderBy', field: 'normalized', dir: 'asc' },
        { _type: 'limit', n: VOCABULARY_SUGGESTION_LIMIT },
      ]);
    });

    it('honours a custom limit', async () => {
      await searchVocabularyWords('esb', 3);
      expect(lastConstraints()).toContainEqual({ _type: 'limit', n: 3 });
    });
  });

  it('getVillagesSayingTerm lists the other villages with the word, never the current one', async () => {
    fakeStore()['vocabularyTerms/m1__esbardo'] = { municipalityId: 'm1', normalized: 'esbardo', status: 'active' };
    fakeStore()['vocabularyTerms/m2__esbardo'] = { municipalityId: 'm2', normalized: 'esbardo', status: 'active' };
    fakeStore()['vocabularyTerms/m3__esbardo'] = { municipalityId: 'm3', normalized: 'esbardo', status: 'hidden' };
    fakeStore()['vocabularyTerms/m4__tejon'] = { municipalityId: 'm4', normalized: 'tejon', status: 'active' };

    const villages = await getVillagesSayingTerm('esbardo', 'm1');

    expect(villages.map((t) => t.municipalityId)).toEqual(['m2']);
  });
});
