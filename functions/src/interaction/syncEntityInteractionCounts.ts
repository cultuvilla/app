import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  eventDoc,
  organizationDoc,
  festivalPosterDoc,
  newsDoc,
  municipalityPlaceDoc,
  municipalityBarrioDoc,
  vocabularyTermDoc,
  historyEntryDoc,
  userNotificationsCollection,
  commentDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData, type EntityKind } from '@cultuvilla/shared/models';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';
import { isNotFound, updateIfStillExists } from '../shared/notFound';

const db = getFirestore();

export type ApplyResult = 'applied' | 'unknown-kind' | 'not-found';

// Routes a field-path update to the parent entity's doc via the typed ref
// factories. The `.update(field, value, …)` field-path overload is used (not the
// data overload) so the entity converters aren't invoked for these partial
// counter writes. Switching and calling `.update` inside each branch keeps
// every ref a single concrete type — no union-assignment problem. Exported so
// `recordEntityView.ts` (the readCount-incrementing callable) can reuse it.
export async function applyToParent(
  entityKind: string,
  entityId: string,
  municipalityId: string,
  field: string,
  value: FieldValue,
  ...more: (string | FieldValue)[]
): Promise<ApplyResult> {
  try {
    switch (entityKind) {
      case 'event':          await eventDoc(db, entityId).update(field, value, ...more); break;
      case 'organization':   await organizationDoc(db, entityId).update(field, value, ...more); break;
      case 'festivalPoster': await festivalPosterDoc(db, entityId).update(field, value, ...more); break;
      case 'news':           await newsDoc(db, entityId).update(field, value, ...more); break;
      case 'place':          await municipalityPlaceDoc(db, municipalityId, entityId).update(field, value, ...more); break;
      case 'barrio':         await municipalityBarrioDoc(db, municipalityId, entityId).update(field, value, ...more); break;
      case 'vocabularyTerm': await vocabularyTermDoc(db, entityId).update(field, value, ...more); break;
      case 'historyEntry':   await historyEntryDoc(db, entityId).update(field, value, ...more); break;
      default:               return 'unknown-kind';
    }
    return 'applied';
  } catch (err) {
    if (isNotFound(err)) return 'not-found'; // parent deleted before trigger ran → no-op (avoid infinite retry)
    throw err;
  }
}

export const syncEntityCommentCount = defineDocumentTrigger(
  'syncEntityCommentCount',
  { kind: 'written', document: 'comments/{commentId}' },
  async (event) => {
    const before = event.data?.before.data() ?? null;
    const after = event.data?.after.data() ?? null;
    if (!before && !after) return;
    let delta = 0;
    if (!before && after) delta = 1;
    else if (before && !after) delta = -1;
    if (delta === 0) return; // comments are immutable (rules), so only create/delete fire
    const d = after ?? before;
    if (!d) return;
    const entityKind = d['entityKind'] as string;
    const entityId = d['entityId'] as string;
    const municipalityId = d['municipalityId'] as string;
    const parentCommentId = (d['parentCommentId'] as string | null | undefined) ?? null;

    const result = await applyToParent(
      entityKind,
      entityId,
      municipalityId,
      'commentCount',
      FieldValue.increment(delta),
    );
    if (result === 'unknown-kind') {
      logger.warn('unknown entityKind for comment count', {
        handler: 'syncEntityCommentCount', entityKind,
      });
      return;
    }
    if (result === 'applied') {
      logger.info('comment count updated', {
        handler: 'syncEntityCommentCount', entityKind, entityId, delta,
      });
    }

    if (parentCommentId) {
      // The parent comment may be gone already: deleting it cascades its replies.
      const parentRef = commentDoc(db, parentCommentId);
      await updateIfStillExists(() => parentRef.update('replyCount', FieldValue.increment(delta)), {
        handler: 'syncEntityCommentCount',
        path: parentRef.path,
      });
    }

    if (parentCommentId && delta === 1) {
      try {
        const parentSnap = await commentDoc(db, parentCommentId).get();
        const parentAuthorUserId = parentSnap.get('authorUserId') as string | undefined;
        const replyAuthorUserId = d['authorUserId'] as string;
        if (parentAuthorUserId && parentAuthorUserId !== replyAuthorUserId) {
          await userNotificationsCollection(db, parentAuthorUserId)
            .doc()
            .set(
              buildNotificationData({
                type: 'comment_reply',
                title: 'Nueva respuesta a tu comentario',
                body: (d['body'] as string).slice(0, 200),
                entityKind: entityKind as EntityKind,
                entityId,
                municipalityId,
              }),
            );
        }
      } catch (err) {
        if (!isNotFound(err)) throw err;
        // parent comment already deleted (cascade in flight) — no-op
      }
    }

    // Cascade-delete replies when a top-level comment is deleted. This only
    // deletes the reply docs — it does NOT touch commentCount for them.
    // Firestore re-fires syncEntityCommentCount for each deleted reply doc
    // (triggers fire for every write, including ones made by our own batch),
    // and that invocation's own unconditional applyToParent call above
    // handles its commentCount decrement. Every comment doc's commentCount
    // decrement is owned by that doc's own trigger invocation — this keeps
    // the property idempotent under any interleaving.
    const MAX_BATCH_SIZE = 500;
    if (delta === -1 && !parentCommentId) {
      const commentId = event.params.commentId;
      const repliesSnap = await db
        .collection('comments')
        .where('parentCommentId', '==', commentId)
        .get();
      if (!repliesSnap.empty) {
        for (let i = 0; i < repliesSnap.docs.length; i += MAX_BATCH_SIZE) {
          const chunk = repliesSnap.docs.slice(i, i + MAX_BATCH_SIZE);
          const batch = db.batch();
          for (const replyDoc of chunk) batch.delete(replyDoc.ref);
          await batch.commit();
        }
        logger.info('cascade-deleted replies for removed comment', {
          handler: 'syncEntityCommentCount', commentId, count: repliesSnap.size,
        });
      }
    }
  },
);
