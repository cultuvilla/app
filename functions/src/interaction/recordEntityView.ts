import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { applyToParent } from './syncEntityInteractionCounts';
import { defineCallable } from '../shared/define/defineCallable';

interface RecordEntityViewData {
  entityKind?: string;
  entityId?: string;
  municipalityId?: string;
}

interface RecordEntityViewResult {
  ok: boolean;
}

export const recordEntityView = defineCallable<RecordEntityViewData, Promise<RecordEntityViewResult>>(
  'recordEntityView',
  { cors: true },
  async (request) => {
    const { entityKind, entityId, municipalityId } = request.data;
    if (!entityKind || !entityId || !municipalityId) {
      throw new HttpsError(
        'invalid-argument',
        'entityKind, entityId, municipalityId required',
      );
    }

    const result = await applyToParent(
      entityKind,
      entityId,
      municipalityId,
      'readCount',
      FieldValue.increment(1),
    );

    if (result === 'unknown-kind') {
      throw new HttpsError('invalid-argument', `unknown entityKind: ${entityKind}`);
    }
    if (result === 'applied') {
      logger.info('entity view recorded', { handler: 'recordEntityView', entityKind, entityId });
    }
    return { ok: true };
  },
);
