import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  organizationChatThreadDoc,
  organizationDoc,
  organizationMemberDoc,
  organizationMembersCollection,
  organizationMessageDoc,
  userGroupPrefsDoc,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  GENERAL_CHAT_THREAD_ID,
  GroupChatMessageDataSchema,
  avisoChatPushUids,
  buildNotificationData,
  groupChatPushBody,
  type GroupChatMessageData,
  type GroupChatThreadData,
} from '@cultuvilla/shared/models';

const HANDLER = 'onGroupChatMessageCreated';
const BATCH_SIZE = 400;
/** The general thread's name in a push title; the app calls it the same. */
const GENERAL_CHAT_TITLE = 'Charla';

/**
 * Moves the thread's summary (when it last moved, who wrote last, who has
 * written) and returns who had written before this message. A transaction, so
 * two messages landing together both make the participant list, and a
 * redelivered event leaves the newest message as the last.
 */
async function recordInThread(
  db: Firestore,
  orgId: string,
  threadId: string,
  message: GroupChatMessageData,
): Promise<string[]> {
  const ref = organizationChatThreadDoc(db, orgId, threadId);
  return db.runTransaction(async (tx) => {
    const prev = (await tx.get(ref)).data() ?? null;
    const participants = prev?.participantUids ?? [];
    const isNewest = !prev || prev.lastMessageAt.getTime() <= message.createdAt.getTime();
    const next: GroupChatThreadData = {
      lastMessageAt: isNewest ? message.createdAt : prev.lastMessageAt,
      lastAuthorUid: isNewest ? message.authorUid : prev.lastAuthorUid,
      participantUids: participants.includes(message.authorUid) ? participants : [...participants, message.authorUid],
    };
    tx.set(ref, next);
    return participants;
  });
}

/** The general chat pushes only the members who opted in for this group. */
async function generalChatPushUids(db: Firestore, orgId: string, writerUid: string): Promise<string[]> {
  const members = (await organizationMembersCollection(db, orgId).get()).docs.map((d) => d.id).filter((uid) => uid !== writerUid);
  if (members.length === 0) return [];
  const prefs = await db.getAll(...members.map((uid) => userGroupPrefsDoc(db, uid, orgId)));
  return members.filter((_, i) => prefs[i]?.data()?.generalChatPush === true);
}

/** An aviso's chat pushes its author and whoever already wrote in it, while they may still read it. */
async function avisoThreadPushUids(
  db: Firestore,
  orgId: string,
  aviso: AvisoHead,
  participantUids: string[],
  writerUid: string,
): Promise<string[]> {
  const candidates = avisoChatPushUids({ avisoAuthorUid: aviso.sentBy, participantUids, writerUid, canRead: () => true });
  if (candidates.length === 0) return [];
  const memberSnaps = await db.getAll(...candidates.map((uid) => organizationMemberDoc(db, orgId, uid)));
  const recipients = new Set(aviso.recipientUids);
  return memberSnaps
    .filter((snap) => snap.exists && (snap.data()?.role === 'admin' || recipients.has(snap.id)))
    .map((snap) => snap.id);
}

interface AvisoHead {
  title: string;
  sentBy: string;
  recipientUids: string[];
}

/**
 * Only the three fields the thread needs, read raw: the chat should not stop
 * pushing because an unrelated aviso field changed shape.
 */
async function readAviso(db: Firestore, orgId: string, messageId: string): Promise<AvisoHead | null> {
  const snap = await db.doc(organizationMessageDoc(db, orgId, messageId).path).get();
  const title: unknown = snap.get('title');
  const sentBy: unknown = snap.get('sentBy');
  const recipientUids: unknown = snap.get('recipientUids');
  if (!snap.exists || typeof title !== 'string' || typeof sentBy !== 'string' || !Array.isArray(recipientUids)) return null;
  return { title, sentBy, recipientUids: recipientUids.filter((u): u is string => typeof u === 'string') };
}

export async function handleGroupChatMessage(
  db: Firestore,
  params: { orgId: string; threadId: string; chatId: string },
  raw: Record<string, unknown>,
): Promise<void> {
  const { orgId, threadId, chatId } = params;
  // Trigger snapshots are not converter-wrapped: createdAt is a Timestamp.
  const createdAt = (raw['createdAt'] as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date();
  const parsed = GroupChatMessageDataSchema.safeParse({ ...raw, createdAt });
  if (!parsed.success) {
    logger.error('Chat message does not match the schema; not recorded', {
      handler: HANDLER,
      orgId,
      threadId,
      chatId,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  const message = parsed.data;

  // Raw, like the aviso: only two fields matter here, and a converter throw would
  // lose the message's summary and its push over an unrelated org field.
  const orgSnap = await db.doc(organizationDoc(db, orgId).path).get();
  const orgName: unknown = orgSnap.get('name');
  const municipalityId: unknown = orgSnap.get('municipalityId');
  if (typeof orgName !== 'string' || typeof municipalityId !== 'string') {
    logger.warn('Chat message in a missing org', { handler: HANDLER, orgId, threadId, chatId });
    return;
  }

  const isGeneral = threadId === GENERAL_CHAT_THREAD_ID;
  const aviso = isGeneral ? null : await readAviso(db, orgId, threadId);
  if (!isGeneral && !aviso) {
    logger.warn('Chat message under a missing aviso', { handler: HANDLER, orgId, threadId, chatId });
    return;
  }

  const previousParticipants = await recordInThread(db, orgId, threadId, message);
  const pushUids = aviso
    ? await avisoThreadPushUids(db, orgId, aviso, previousParticipants, message.authorUid)
    : await generalChatPushUids(db, orgId, message.authorUid);

  const notification = buildNotificationData({
    // The group category, routed to the group and muted per group: a client
    // that predates the chat still parses and opens it.
    type: 'group_message',
    title: `${orgName} · ${aviso ? aviso.title : GENERAL_CHAT_TITLE}`,
    body: groupChatPushBody(message.authorName, message.body),
    municipalityId,
    entityKind: 'organization',
    entityId: orgId,
    createdAt: message.createdAt,
  });
  for (let start = 0; start < pushUids.length; start += BATCH_SIZE) {
    const batch = db.batch();
    for (const uid of pushUids.slice(start, start + BATCH_SIZE)) {
      // Keyed on the message, so a redelivered event overwrites rather than pushes twice.
      batch.set(userNotificationsCollection(db, uid).doc(`group_chat_${threadId}_${chatId}`), notification);
    }
    await batch.commit();
  }

  logger.info('Chat message recorded', {
    handler: HANDLER,
    orgId,
    threadId,
    chatId,
    thread: isGeneral ? 'general' : 'aviso',
    pushed: pushUids.length,
  });
}

/** The group's general chat ("Charla"). */
export const onGroupChatMessageCreated = onDocumentCreated(
  { document: 'organizations/{orgId}/chat/{chatId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleGroupChatMessage(
      getFirestore(),
      { orgId: event.params.orgId, threadId: GENERAL_CHAT_THREAD_ID, chatId: event.params.chatId },
      snap.data(),
    );
  },
);

/** An aviso's chat. */
export const onAvisoChatMessageCreated = onDocumentCreated(
  { document: 'organizations/{orgId}/messages/{messageId}/chat/{chatId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleGroupChatMessage(
      getFirestore(),
      { orgId: event.params.orgId, threadId: event.params.messageId, chatId: event.params.chatId },
      snap.data(),
    );
  },
);
