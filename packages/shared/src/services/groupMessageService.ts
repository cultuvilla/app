// packages/shared/src/services/groupMessageService.ts
import { doc, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from '../firebase/sdk/firestore';
import { firebaseErrorCode } from '../firebase/sdk/errors';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  organizationMessageDeliveriesCollection,
  organizationMessageReadDoc,
  organizationMessageReadsCollection,
  organizationMessagesCollection,
  organizationMessageVoteDoc,
  organizationMessageVotesCollection,
  organizationMessageWriteDoc,
  userGroupPrefsDoc,
} from '../firebase/refs/client';
import {
  GroupPollVoteDataSchema,
  type GroupMessageData,
  type GroupMessageDeliveryData,
  type GroupMessageReadData,
  type GroupPollVoteData,
  type NudgeGroupMessageResult,
  type SendGroupMessageInput,
  type SendGroupMessageResult,
} from '../models/organization/GroupMessageDataModel';
import { groupNotifyPrefs, type GroupNotificationPrefsData, type GroupNotifyLevel } from '../models/notification/NotificationPrefsDataModel';
import { observability } from './observability/observabilityService';
import { watchDoc, watchDocsByIds, watchQuery, type Unwatch, type WatchError } from './watch';

export type GroupMessage = GroupMessageData & { id: string };
export type GroupMessageDelivery = GroupMessageDeliveryData & { id: string };
export type GroupMessageRead = GroupMessageReadData & { id: string };
export type GroupPollVote = GroupPollVoteData & { id: string };

/** How much history an admin's list and a member's notices show. */
const ADMIN_HISTORY_LIMIT = 50;
const MEMBER_NOTICES_LIMIT = 20;

// =============================================================================
// SENDING — callables (admins only)
// =============================================================================

/** A fresh id for the composer: the callable keys the message on it, so a retry sends nothing twice. */
export function newGroupMessageId(orgId: string): string {
  return doc(organizationMessagesCollection(getDb(), orgId)).id;
}

/** Admin: send a message. The server resolves the audience and fans out push, email and the WhatsApp list. */
export async function sendGroupMessage(input: SendGroupMessageInput): Promise<SendGroupMessageResult> {
  const fn = httpsCallable<SendGroupMessageInput, SendGroupMessageResult>(getFirebaseFunctions(), 'sendGroupMessage');
  return (await fn(input)).data;
}

/** Admin: push the message again to the recipients who have not opened it. */
export async function nudgeGroupMessage(orgId: string, messageId: string): Promise<NudgeGroupMessageResult> {
  const fn = httpsCallable<{ orgId: string; messageId: string }, NudgeGroupMessageResult>(getFirebaseFunctions(), 'nudgeGroupMessage');
  return (await fn({ orgId, messageId })).data;
}

// =============================================================================
// HISTORY — admins
// =============================================================================

/** Admin: the group's messages, newest first. */
export function watchGroupMessages(orgId: string, onNext: (rows: GroupMessage[]) => void, onError: WatchError): Unwatch {
  return watchQuery(
    query(organizationMessagesCollection(getDb(), orgId), orderBy('sentAt', 'desc'), limit(ADMIN_HISTORY_LIMIT)),
    onNext,
    onError,
  );
}

/** Admin: who a message went to, and by which channel. */
export function watchGroupMessageDeliveries(
  orgId: string,
  messageId: string,
  onNext: (rows: GroupMessageDelivery[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(organizationMessageDeliveriesCollection(getDb(), orgId, messageId), onNext, onError);
}

/** Admin: who has opened a message. */
export function watchGroupMessageReads(
  orgId: string,
  messageId: string,
  onNext: (rows: GroupMessageRead[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(organizationMessageReadsCollection(getDb(), orgId, messageId), onNext, onError);
}

/** Admin: every vote on a message's poll. Members may read only their own. */
export function watchGroupPollVotes(
  orgId: string,
  messageId: string,
  onNext: (rows: GroupPollVote[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(organizationMessageVotesCollection(getDb(), orgId, messageId), onNext, onError);
}

/** Admin: tick (or untick) a recipient's WhatsApp as sent by hand. */
export async function setWhatsappSent(orgId: string, messageId: string, recipientKey: string, adminUid: string, sent: boolean): Promise<void> {
  await updateDoc(organizationMessageWriteDoc(getDb(), orgId, messageId, 'deliveries', recipientKey), {
    whatsappSentAt: sent ? serverTimestamp() : null,
    whatsappSentBy: sent ? adminUid : null,
  });
}

// =============================================================================
// NOTICES — the recipients
// =============================================================================

/** The messages that reached `uid` in the app, newest first. */
export function watchMyGroupMessages(
  orgId: string,
  uid: string,
  onNext: (rows: GroupMessage[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(
    query(
      organizationMessagesCollection(getDb(), orgId),
      where('recipientUids', 'array-contains', uid),
      orderBy('sentAt', 'desc'),
      limit(MEMBER_NOTICES_LIMIT),
    ),
    onNext,
    onError,
  );
}

/** Which of these messages `uid` has opened. */
export function watchMyGroupMessageReads(
  orgId: string,
  uid: string,
  messageIds: string[],
  onNext: (rows: GroupMessageRead[]) => void,
  onError: WatchError,
): Unwatch {
  return watchDocsByIds(
    messageIds,
    (id, next, error) =>
      watchDoc(
        organizationMessageReadDoc(getDb(), orgId, id, uid),
        (row) => {
          next(row ? { ...row, id } : null);
        },
        error,
      ),
    onNext,
    onError,
  );
}

/** `uid`'s votes on these messages' polls, keyed by message id. */
export function watchMyGroupPollVotes(
  orgId: string,
  uid: string,
  messageIds: string[],
  onNext: (rows: GroupPollVote[]) => void,
  onError: WatchError,
): Unwatch {
  return watchDocsByIds(
    messageIds,
    (id, next, error) =>
      watchDoc(
        organizationMessageVoteDoc(getDb(), orgId, id, uid),
        (row) => {
          next(row ? { ...row, id } : null);
        },
        error,
      ),
    onNext,
    onError,
  );
}

/**
 * The receipts this session has sent or seen refused, by path: the pending
 * promise while in flight, then a settled one. Rules make a receipt write-once,
 * and a caller that marks whenever its read list lacks the receipt loops if the
 * list ever does: each refused rewrite is a pending local write the listener
 * shows and then rolls back, which re-arms the caller. On iOS (ios-e2e,
 * 2026-11-20) the aviso screen sent 10+ refused rewrites a second that way.
 */
// Keyed by uid too, so another account signed in on the device never inherits
// one; a receipt stays read for its uid across sign-outs, so nothing to clear.
const receipts = new Map<string, Promise<void>>();

/**
 * A recipient opened the message. Written once: a receipt this session has
 * already written, is writing, or saw the rules refuse (it exists, or the
 * message is not theirs to mark) is never sent again. Any other failure
 * rejects, and the next call tries again.
 */
export function markGroupMessageRead(orgId: string, messageId: string, uid: string): Promise<void> {
  const key = `${orgId}/${messageId}/${uid}`;
  const known = receipts.get(key);
  if (known) return known;
  const write = setDoc(organizationMessageWriteDoc(getDb(), orgId, messageId, 'reads', uid), { readAt: serverTimestamp() }).catch(
    (error: unknown) => {
      if (firebaseErrorCode(error) === 'permission-denied') {
        // Usually the receipt already exists (another device, an earlier
        // install); a refused create — a recipient who left the group — looks
        // the same. Neither is worth retrying; remembered, so logged once.
        observability.logger.warn('group message read receipt refused by rules; not retried', {
          operation: 'markGroupMessageRead',
          entityKind: 'groupMessage',
          entityId: messageId,
        });
        return;
      }
      receipts.delete(key);
      throw error;
    },
  );
  receipts.set(key, write);
  return write;
}

/** One vote per account: a second vote replaces the first. */
export async function castGroupPollVote(orgId: string, messageId: string, uid: string, option: number): Promise<void> {
  GroupPollVoteDataSchema.parse({ option, votedAt: new Date() });
  await setDoc(organizationMessageWriteDoc(getDb(), orgId, messageId, 'votes', uid), { option, votedAt: serverTimestamp() });
}

// =============================================================================
// MUTE — per group, push only
// =============================================================================

/** The member's preference for this group's message pushes; null = never set (they push). */
export function watchGroupNotificationPrefs(
  uid: string,
  orgId: string,
  onNext: (prefs: GroupNotificationPrefsData | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(userGroupPrefsDoc(getDb(), uid, orgId), onNext, onError);
}

/**
 * How much this group notifies the member (Ajustes → Notificaciones). Writes
 * both switches, and the doc's own id the chat trigger queries by. The cuota
 * reminders never read it.
 */
export async function setGroupNotifyLevel(uid: string, orgId: string, level: GroupNotifyLevel): Promise<void> {
  await setDoc(
    userGroupPrefsDoc(getDb(), uid, orgId).withConverter(null),
    { ...groupNotifyPrefs(level), orgId, updatedAt: new Date() },
    { merge: true },
  );
}
