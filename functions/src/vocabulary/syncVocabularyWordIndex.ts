import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { vocabularyTermsCollection, vocabularyWordDoc } from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildVocabularyWordData,
  isSharedVocabularyKind,
  type VocabularyTermKind,
} from '@cultuvilla/shared/models';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';

const db = getFirestore();

/**
 * Keeps `vocabularyWords/{slug}` — the one-row-per-word index the "añadir
 * palabra" search reads — in step with the village entries underneath it.
 *
 * The index is derived, never authored: a word exists because some village
 * recorded it. So this recounts the word's active entries from scratch on every
 * write rather than incrementing a counter, and **deletes the word when the last
 * village drops it**. A stale row would offer villagers a word no pueblo has.
 *
 * Only `palabra` and `dicho` are indexed — see SHARED_VOCABULARY_KINDS for why
 * motes and topónimos must never merge across villages.
 */
export const syncVocabularyWordIndex = defineDocumentTrigger(
  'syncVocabularyWordIndex',
  { kind: 'written', document: 'vocabularyTerms/{termId}' },
  async (event) => {
    const before = event.data?.before.data() ?? null;
    const after = event.data?.after.data() ?? null;
    const doc = after ?? before;
    if (!doc) return;

    const normalized = doc['normalized'] as string | undefined;
    const kind = doc['kind'] as VocabularyTermKind | undefined;
    if (!normalized || !kind || !isSharedVocabularyKind(kind)) return;

    // Recount rather than increment: a term's status can flip, and the entry
    // that "created" the word can be the one deleted.
    const entries = await vocabularyTermsCollection(db)
      .where('normalized', '==', normalized)
      .where('status', '==', 'active')
      .get();

    const shared = entries.docs
      .map((d) => d.data())
      .filter((d) => isSharedVocabularyKind(d.kind))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const ref = vocabularyWordDoc(db, normalized);

    if (shared.length === 0) {
      await ref.delete();
      logger.info('vocabulary word dropped — no village records it', {
        handler: 'syncVocabularyWordIndex',
        word: normalized,
      });
      return;
    }

    // The first village to write it down fixes the spelling and the kind for
    // everyone, so a later pueblo cannot rename the shared word.
    const first = shared[0];
    await ref.set(
      buildVocabularyWordData({
        term: first.term,
        normalized,
        kind: first.kind,
        villageCount: shared.length,
        firstMunicipalityId: first.municipalityId,
        createdAt: first.createdAt,
        updatedAt: new Date(),
      }),
    );

    logger.info('vocabulary word indexed', {
      handler: 'syncVocabularyWordIndex',
      word: normalized,
      villageCount: shared.length,
    });
  },
);
