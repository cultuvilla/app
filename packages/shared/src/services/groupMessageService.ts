// packages/shared/src/services/groupMessageService.ts
import { doc, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  organizationMessageDeliveriesCollection,
  organizationMessageDoc,
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
import { buildGroupNotificationPrefsData, type GroupNotificationPrefsData } from '../models/notification/NotificationPrefsDataModel';
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

/** Admin: pin a message to its recipients' group home, or take it down. */
export async function setGroupMessagePinned(orgId: string, messageId: string, pinned: boolean): Promise<void> {
  await updateDoc(organizationMessageWriteDocFor(orgId, messageId), { pinned });
}

/** Admin: tick (or untick) a recipient's WhatsApp as sent by hand. */
export async function setWhatsappSent(orgId: string, messageId: string, recipientKey: string, adminUid: string, sent: boolean): Promise<void> {
  await updateDoc(organizationMessageWriteDoc(getDb(), orgId, messageId, 'deliveries', recipientKey), {
    whatsappSentAt: sent ? serverTimestamp() : null,
    whatsappSentBy: sent ? adminUid : null,
  });
}

function organizationMessageWriteDocFor(orgId: string, messageId: string) {
  return organizationMessageDoc(getDb(), orgId, messageId).withConverter(null);
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

/** A recipient opened the message. Written once; rules refuse a second write. */
export async function markGroupMessageRead(orgId: string, messageId: string, uid: string): Promise<void> {
  await setDoc(organizationMessageWriteDoc(getDb(), orgId, messageId, 'reads', uid), { readAt: serverTimestamp() });
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

/** Mute or unmute this group's message pushes. The cuota reminders never read it. */
export async function setGroupMessagesMuted(uid: string, orgId: string, muted: boolean): Promise<void> {
  await setDoc(userGroupPrefsDoc(getDb(), uid, orgId), buildGroupNotificationPrefsData({ messagesMuted: muted }));
}
