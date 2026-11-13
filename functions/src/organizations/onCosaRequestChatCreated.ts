import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { cosaRequestDoc, userBlockedUserDoc, userNotificationsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData, cosaChatPushUids, GroupChatMessageDataSchema, groupChatPushBody } from '@cultuvilla/shared/models';
import { cosaManagerUids } from './onCosaRequestWritten';

const HANDLER = 'onCosaRequestChatCreated';

/**
 * Pushes a request chat message to the request's other parties: the requester
 * and the cosa's managers. A `group_task` notification carrying the
 * `cosaRequestId`, so it opens the request (an older binary opens the group).
 */
export async function handleCosaRequestChatMessage(
  db: Firestore,
  params: { requestId: string; chatId: string },
  raw: Record<string, unknown>,
): Promise<number> {
  const { requestId, chatId } = params;
  // Trigger snapshots are not converter-wrapped: createdAt is a Timestamp.
  const createdAt = (raw['createdAt'] as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date();
  const parsed = GroupChatMessageDataSchema.safeParse({ ...raw, createdAt });
  if (!parsed.success) {
    logger.error('Cosa request chat message does not match the schema; not pushed', { handler: HANDLER, requestId, chatId });
    return 0;
  }
  const message = parsed.data;
  const req = (await cosaRequestDoc(db, requestId).get()).data();
  if (!req) {
    logger.warn('Cosa request chat message under a missing request', { handler: HANDLER, requestId, chatId });
    return 0;
  }
  const parties = cosaChatPushUids(req, await cosaManagerUids(db, req), message.authorUid);
  // The app hides a blocked author's messages; the push and the Buzón must not show them either.
  const blocked = await Promise.all(parties.map((uid) => userBlockedUserDoc(db, uid, message.authorUid).get()));
  const recipients = parties.filter((_, i) => !blocked[i]?.exists);
  const notification = buildNotificationData({
    type: 'group_task',
    title: `«${req.cosaTitle}»`,
    body: groupChatPushBody(message.authorName, message.body),
    municipalityId: req.municipalityId,
    requesterUid: req.requesterUid,
    entityKind: 'organization',
    entityId: req.orgId,
    cosaRequestId: requestId,
    topic: 'cosateca_chat',
    createdAt: message.createdAt,
  });
  const batch = db.batch();
  // Keyed on the message, so a redelivered event overwrites rather than pushes twice.
  for (const uid of recipients) batch.set(userNotificationsCollection(db, uid).doc(`cosa_chat_${requestId}_${chatId}`), notification);
  await batch.commit();
  logger.info('Cosa request chat message pushed', { handler: HANDLER, requestId, chatId, pushed: recipients.length });
  return recipients.length;
}

/**
 * A deleted message (its author's, or a moderator's from Denuncias) takes its
 * notifications with it, or the Buzón would keep quoting it. Found by the
 * request id the notifications carry rather than by recomputing the recipients:
 * the request may be gone and the group's admins may have changed since.
 */
export async function handleCosaRequestChatMessageDeleted(
  db: Firestore,
  params: { requestId: string; chatId: string },
): Promise<number> {
  const { requestId, chatId } = params;
  const docId = `cosa_chat_${requestId}_${chatId}`;
  const snap = await db.collectionGroup('notifications').where('cosaRequestId', '==', requestId).select().get();
  const refs = snap.docs.filter((d) => d.id === docId).map((d) => d.ref);
  if (refs.length > 0) {
    const batch = db.batch();
    for (const ref of refs) batch.delete(ref);
    await batch.commit();
  }
  logger.info('Cosa request chat notifications removed', { handler: 'onCosaRequestChatDeleted', requestId, chatId, removed: refs.length });
  return refs.length;
}

export const onCosaRequestChatCreated = onDocumentCreated(
  { document: 'cosaRequests/{requestId}/chat/{chatId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleCosaRequestChatMessage(getFirestore(), { requestId: event.params.requestId, chatId: event.params.chatId }, snap.data());
  },
);

export const onCosaRequestChatDeleted = onDocumentDeleted(
  { document: 'cosaRequests/{requestId}/chat/{chatId}', region: 'us-central1' },
  async (event) => {
    await handleCosaRequestChatMessageDeleted(getFirestore(), { requestId: event.params.requestId, chatId: event.params.chatId });
  },
);
