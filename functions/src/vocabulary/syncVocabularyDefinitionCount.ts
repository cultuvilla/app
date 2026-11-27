import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { vocabularyTermDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { isNotFound } from '../interaction/syncEntityInteractionCounts';
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

    try {
      await vocabularyTermDoc(db, termId).update('definitionCount', FieldValue.increment(delta));
    } catch (err) {
      // Term deleted before the trigger ran (an admin removing a whole headword
      // cascades its definitions) — nothing to keep in step, and retrying would
      // loop forever.
      if (!isNotFound(err)) throw err;
      return;
    }

    logger.info('vocabulary definition count updated', {
      handler: 'syncVocabularyDefinitionCount',
      termId,
      delta,
    });
  },
);
