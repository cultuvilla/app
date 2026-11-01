import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  organizationDoc,
  organizationMemberDoc,
  organizationTaskDoc,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  GroupChatMessageDataSchema,
  buildNotificationData,
  groupChatPushBody,
  taskCommentPushUids,
} from '@cultuvilla/shared/models';

const HANDLER = 'onTaskCommentCreated';

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/**
 * Pushes a task's new comment to its creator and the people on it, while they
 * are still members. A `group_task` notification, so it opens the group's
 * Tareas and an older binary still parses it. The task and the org are read
 * raw: a converter throw on an unrelated field should not lose the push.
 */
export async function handleTaskComment(
  db: Firestore,
  params: { orgId: string; taskId: string; commentId: string },
  raw: Record<string, unknown>,
): Promise<void> {
  const { orgId, taskId, commentId } = params;
  // Trigger snapshots are not converter-wrapped: createdAt is a Timestamp.
  const createdAt = (raw['createdAt'] as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date();
  const parsed = GroupChatMessageDataSchema.safeParse({ ...raw, createdAt });
  if (!parsed.success) {
    logger.error('Task comment does not match the schema; not pushed', { handler: HANDLER, orgId, taskId, commentId });
    return;
  }
  const comment = parsed.data;

  const [taskSnap, orgSnap] = await Promise.all([
    db.doc(organizationTaskDoc(db, orgId, taskId).path).get(),
    db.doc(organizationDoc(db, orgId).path).get(),
  ]);
  const taskTitle: unknown = taskSnap.get('title');
  const orgName: unknown = orgSnap.get('name');
  const municipalityId: unknown = orgSnap.get('municipalityId');
  const createdBy: unknown = taskSnap.get('createdBy');
  if (typeof taskTitle !== 'string' || typeof orgName !== 'string' || typeof createdBy !== 'string') {
    logger.warn('Task comment under a missing task or org', { handler: HANDLER, orgId, taskId, commentId });
    return;
  }

  const candidates = taskCommentPushUids(
    { createdBy, assigneeUids: strings(taskSnap.get('assigneeUids')), claimedUids: strings(taskSnap.get('claimedUids')) },
    comment.authorUid,
  );
  const members = candidates.length > 0 ? await db.getAll(...candidates.map((uid) => organizationMemberDoc(db, orgId, uid))) : [];
  const pushUids = members.filter((snap) => snap.exists).map((snap) => snap.id);

  const notification = buildNotificationData({
    type: 'group_task',
    title: `${orgName} · «${taskTitle}»`,
    body: groupChatPushBody(comment.authorName, comment.body),
    municipalityId: typeof municipalityId === 'string' ? municipalityId : null,
    entityKind: 'organization',
    entityId: orgId,
    createdAt: comment.createdAt,
  });
  const batch = db.batch();
  for (const uid of pushUids) {
    // Keyed on the comment, so a redelivered event overwrites rather than pushes twice.
    batch.set(userNotificationsCollection(db, uid).doc(`group_task_comment_${taskId}_${commentId}`), notification);
  }
  await batch.commit();

  logger.info('Task comment pushed', { handler: HANDLER, orgId, taskId, commentId, pushed: pushUids.length });
}

export const onTaskCommentCreated = onDocumentCreated(
  { document: 'organizations/{orgId}/tasks/{taskId}/chat/{chatId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleTaskComment(
      getFirestore(),
      { orgId: event.params.orgId, taskId: event.params.taskId, commentId: event.params.chatId },
      snap.data(),
    );
  },
);

/** A deleted task takes its comments with it: nothing else could ever reach them again. */
export const onGroupTaskDeleted = onDocumentDeleted(
  { document: 'organizations/{orgId}/tasks/{taskId}', region: 'us-central1' },
  async (event) => {
    if (!event.data) return;
    await getFirestore().recursiveDelete(event.data.ref.collection('chat'));
  },
);
