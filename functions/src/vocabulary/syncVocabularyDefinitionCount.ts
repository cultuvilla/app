import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { vocabularyTermDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { updateIfStillExists } from '../shared/notFound';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';

const db = getFirestore();

/**
 * Keeps `vocabularyTerms/{id}.definitionCount` in step with the definitions
 * pointing at it.
 *
 * The count is not cosmetic — `firestore.rules` reads it to decide whether the
 * author of a headword may still withdraw it, so a term whose last definition
 * was just deleted must actually reach zero. Hiding and unhiding a definition
 * count as leaving and rejoining: a hidden meaning is not visible to the pueblo,
 * so it must not hold an otherwise-empty headword hostage.
 */
export const syncVocabularyDefinitionCount = defineDocumentTrigger(
  'syncVocabularyDefinitionCount',
  { kind: 'written', document: 'vocabularyDefinitions/{definitionId}' },
  async (event) => {
    const before = event.data?.before.data() ?? null;
    const after = event.data?.after.data() ?? null;
    if (!before && !after) return;

    const countedBefore = before != null && before['status'] === 'active';
    const countedAfter = after != null && after['status'] === 'active';
    const delta = Number(countedAfter) - Number(countedBefore);
    if (delta === 0) return;

    const termId = ((after ?? before) as Record<string, unknown>)['termId'] as string;
    if (!termId) return;

    // An admin removing a whole headword cascades its definitions, so the term
    // may be gone already.
    const termRef = vocabularyTermDoc(db, termId);
    const applied = await updateIfStillExists(
      () => termRef.update('definitionCount', FieldValue.increment(delta)),
      { handler: 'syncVocabularyDefinitionCount', path: termRef.path },
    );
    if (!applied) return;

    logger.info('vocabulary definition count updated', {
      handler: 'syncVocabularyDefinitionCount',
      termId,
      delta,
    });
  },
);
