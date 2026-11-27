// Trigger tests for syncVocabularyWordIndex — the one-row-per-word index that
// makes "this word already exists" findable while typing.
//
// The index is derived, so the cases that matter are the ones where it must
// *stop* claiming something: the last village dropping a word, a word hidden by
// moderation, and the kinds that must never merge across villages.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncVocabularyWordIndex } from '../../../vocabulary/syncVocabularyWordIndex';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncVocabularyWordIndex);

interface TermSeed {
  municipalityId: string;
  term?: string;
  normalized?: string;
  kind?: 'palabra' | 'dicho' | 'mote' | 'toponimo';
  status?: 'active' | 'hidden';
  createdAt?: Date;
}

function termDoc(seed: TermSeed) {
  const normalized = seed.normalized ?? 'esbardo';
  return {
    municipalityId: seed.municipalityId,
    term: seed.term ?? 'Esbardo',
    normalized,
    kind: seed.kind ?? 'palabra',
    createdBy: 'alice',
    contributorUserIds: ['alice'],
    contributorOrgIds: [],
    createdAt: seed.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    definitionCount: 1,
    commentCount: 0,
    readCount: 0,
    status: seed.status ?? 'active',
    hiddenBy: null,
    hiddenAt: null,
    hiddenReason: null,
  };
}

function termId(seed: TermSeed) {
  return `${seed.municipalityId}__${seed.normalized ?? 'esbardo'}`;
}

async function seedTerm(seed: TermSeed): Promise<void> {
  await admin.firestore().doc(`vocabularyTerms/${termId(seed)}`).set(termDoc(seed));
}

async function removeTerm(seed: TermSeed): Promise<void> {
  await admin.firestore().doc(`vocabularyTerms/${termId(seed)}`).delete();
}

/** Fire the trigger for one entry, as Firestore would after that write. */
async function fire(
  before: TermSeed | null,
  after: TermSeed | null,
  seed: TermSeed,
): Promise<void> {
  const path = `vocabularyTerms/${termId(seed)}`;
  const change = ft.makeChange(
    ft.firestore.makeDocumentSnapshot(before ? termDoc(before) : {}, path),
    ft.firestore.makeDocumentSnapshot(after ? termDoc(after) : {}, path),
  );
  await wrapped({ data: change, params: { termId: termId(seed) } });
}

async function word(slug = 'esbardo') {
  const snap = await admin.firestore().doc(`vocabularyWords/${slug}`).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

beforeAll(async () => {
  await resetEmulators();
});
beforeEach(async () => {
  await resetEmulators();
});
afterAll(() => {
  ft.cleanup();
});

describe('syncVocabularyWordIndex', () => {
  it('indexes a word the first time a village records it', async () => {
    const a = { municipalityId: 'm1' };
    await seedTerm(a);
    await fire(null, a, a);
    expect(await word()).toMatchObject({
      term: 'Esbardo',
      normalized: 'esbardo',
      kind: 'palabra',
      villageCount: 1,
      firstMunicipalityId: 'm1',
    });
  });

  it('counts the villages, not the entries, when a second pueblo adopts it', async () => {
    const a = { municipalityId: 'm1' };
    const b = { municipalityId: 'm2' };
    await seedTerm(a);
    await seedTerm(b);
    await fire(null, b, b);
    expect(await word()).toMatchObject({ villageCount: 2 });
  });

  it('keeps the spelling of the village that recorded it first', async () => {
    const first = { municipalityId: 'm1', term: 'Esbardo', createdAt: new Date('2026-01-01') };
    const later = { municipalityId: 'm2', term: 'ESBARDO', createdAt: new Date('2026-06-01') };
    await seedTerm(first);
    await seedTerm(later);
    await fire(null, later, later);
    expect(await word()).toMatchObject({ term: 'Esbardo', firstMunicipalityId: 'm1' });
  });

  it('drops the word when the last village stops recording it', async () => {
    const a = { municipalityId: 'm1' };
    await seedTerm(a);
    await fire(null, a, a);
    await removeTerm(a);
    await fire(a, null, a);
    expect(await word()).toBeNull();
  });

  it('keeps the word while another village still records it', async () => {
    const a = { municipalityId: 'm1' };
    const b = { municipalityId: 'm2' };
    await seedTerm(a);
    await seedTerm(b);
    await fire(null, b, b);
    await removeTerm(b);
    await fire(b, null, b);
    expect(await word()).toMatchObject({ villageCount: 1, firstMunicipalityId: 'm1' });
  });

  it('does not count a village whose entry moderation has hidden', async () => {
    const a = { municipalityId: 'm1' };
    const hidden = { municipalityId: 'm2', status: 'hidden' as const };
    await seedTerm(a);
    await seedTerm(hidden);
    await fire({ municipalityId: 'm2' }, hidden, hidden);
    expect(await word()).toMatchObject({ villageCount: 1 });
  });

  it('drops the word entirely once every entry is hidden', async () => {
    const active = { municipalityId: 'm1' };
    await seedTerm(active);
    await fire(null, active, active);
    const hidden = { municipalityId: 'm1', status: 'hidden' as const };
    await seedTerm(hidden);
    await fire(active, hidden, hidden);
    expect(await word()).toBeNull();
  });

  // A mote names one village's family and a topónimo one village's field, so
  // merging them across pueblos would be a factual error.
  it('never indexes a mote', async () => {
    const m = { municipalityId: 'm1', kind: 'mote' as const, normalized: 'los-pelaos' };
    await seedTerm(m);
    await fire(null, m, m);
    expect(await word('los-pelaos')).toBeNull();
  });

  it('never indexes a topónimo', async () => {
    const t = { municipalityId: 'm1', kind: 'toponimo' as const, normalized: 'el-cerro' };
    await seedTerm(t);
    await fire(null, t, t);
    expect(await word('el-cerro')).toBeNull();
  });

  it('indexes a dicho, which does travel between villages', async () => {
    const d = {
      municipalityId: 'm1',
      kind: 'dicho' as const,
      normalized: 'a-buenas-horas-mangas-verdes',
      term: 'A buenas horas, mangas verdes',
    };
    await seedTerm(d);
    await fire(null, d, d);
    expect(await word('a-buenas-horas-mangas-verdes')).toMatchObject({ kind: 'dicho', villageCount: 1 });
  });

  it('a topónimo in one village does not disturb a real word of the same name', async () => {
    const palabra = { municipalityId: 'm1', normalized: 'cerro', term: 'Cerro' };
    const toponimo = { municipalityId: 'm2', normalized: 'cerro', kind: 'toponimo' as const };
    await seedTerm(palabra);
    await fire(null, palabra, palabra);
    await seedTerm(toponimo);
    await fire(null, toponimo, toponimo);
    // The topónimo write must leave the real word exactly as it was, rather
    // than counting itself into it or dropping it.
    expect(await word('cerro')).toMatchObject({ villageCount: 1, firstMunicipalityId: 'm1' });
  });
});
