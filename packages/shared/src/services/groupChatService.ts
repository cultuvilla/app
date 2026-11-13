// packages/shared/src/services/groupChatService.ts
import {
  deleteDoc,
  deleteField,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import {
  organizationChatCollection,
  organizationChatReadDoc,
  organizationChatReadWriteDoc,
  organizationChatThreadDoc,
  organizationChatWriteCollection,
  organizationChatWriteDoc,
  organizationMessageDoc,
} from '../firebase/refs/client';
import {
  GroupChatBodySchema,
  type GroupChatMessageData,
  type GroupChatReaction,
  type GroupChatReply,
  type GroupChatReadData,
  type GroupChatThreadData,
} from '../models/organization/GroupChatDataModel';
import type { GroupMessageData } from '../models/organization/GroupMessageDataModel';
import { watchDoc, watchDocsByIds, watchQuery, type Unwatch, type WatchError } from './watch';

export type GroupChatMessage = GroupChatMessageData & { id: string };
export type GroupChatThread = GroupChatThreadData & { id: string };
export type GroupChatRead = GroupChatReadData & { id: string };

// A thread is an aviso's id, or GENERAL_CHAT_THREAD_ID for the group's Charla.

// =============================================================================
// MESSAGES
// =============================================================================

/**
 * A thread's latest `count` messages (start at GROUP_CHAT_PAGE_SIZE), newest
 * first. Pages by asking again with a larger count, so the listener keeps every
 * shown message live.
 */
export function watchGroupChat(
  orgId: string,
  threadId: string,
  count: number,
  onNext: (rows: GroupChatMessage[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(
    query(organizationChatCollection(getDb(), orgId, threadId), orderBy('createdAt', 'desc'), limit(count)),
    onNext,
    onError,
  );
}

export interface SendGroupChatMessageInput {
  orgId: string;
  threadId: string;
  uid: string;
  /** The author's public name (`publicProfiles/{uid}.displayName`) — the rules refuse any other. */
  authorName: string;
  body: string;
  /** The message this one answers, in the same thread. */
  replyTo?: Pick<GroupChatMessage, 'id' | 'authorUid' | 'authorName' | 'body'>;
}

/**
 * Write a message. Throws on an empty or over-long body before writing. The
 * rules refuse a writer who may not read the thread, a non-admin in a general
 * chat set to "solo la junta escribe", and a quote that is not the quoted
 * message as it stands. Returns the new message's id.
 */
export async function sendGroupChatMessage(input: SendGroupChatMessageInput): Promise<string> {
  const body = GroupChatBodySchema.parse(input.body);
  const ref = doc(organizationChatWriteCollection(getDb(), input.orgId, input.threadId));
  const replyTo: GroupChatReply | undefined = input.replyTo
    ? {
        chatId: input.replyTo.id,
        authorUid: input.replyTo.authorUid,
        authorName: input.replyTo.authorName,
        body: input.replyTo.body,
      }
    : undefined;
  await setDoc(ref, {
    authorUid: input.uid,
    authorName: input.authorName,
    body,
    createdAt: serverTimestamp(),
    ...(replyTo ? { replyTo } : {}),
  });
  return ref.id;
}

/**
 * Leave `uid`'s one reaction on a message, replacing the one they had; null
 * takes it away. Anyone who reads the thread may — even where only the junta
 * writes — and the rules let nobody touch another reader's reaction.
 */
export async function setGroupChatReaction(
  orgId: string,
  threadId: string,
  chatId: string,
  uid: string,
  reaction: GroupChatReaction | null,
): Promise<void> {
  await updateDoc(organizationChatWriteDoc(getDb(), orgId, threadId, chatId), {
    [`reactions.${uid}`]: reaction ?? deleteField(),
  });
}

/** The author removes their own message; an admin removes anyone's. There is no edit. */
export async function deleteGroupChatMessage(orgId: string, threadId: string, chatId: string): Promise<void> {
  await deleteDoc(organizationChatWriteDoc(getDb(), orgId, threadId, chatId));
}

/** One aviso, the head of its thread. The rules refuse a member it did not reach. */
export function watchGroupAviso(
  orgId: string,
  messageId: string,
  onNext: (row: (GroupMessageData & { id: string }) | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(organizationMessageDoc(getDb(), orgId, messageId), onNext, onError);
}

// =============================================================================
// UNREAD — thread summaries and the reader's last open
// =============================================================================

/** These threads' summaries, in the order given; a thread nobody has written in yet is absent. */
export function watchGroupChatThreads(
  orgId: string,
  threadIds: string[],
  onNext: (rows: GroupChatThread[]) => void,
  onError: WatchError,
): Unwatch {
  return watchDocsByIds(
    threadIds,
    (id, next, error) => watchDoc(organizationChatThreadDoc(getDb(), orgId, id), next, error),
    onNext,
    onError,
  );
}

/** When `uid` last opened each of these threads; a thread never opened is absent. */
export function watchMyGroupChatReads(
  orgId: string,
  uid: string,
  threadIds: string[],
  onNext: (rows: GroupChatRead[]) => void,
  onError: WatchError,
): Unwatch {
  return watchDocsByIds(
    threadIds,
    (id, next, error) =>
      watchDoc(
        organizationChatReadDoc(getDb(), orgId, id, uid),
        (row) => {
          next(row ? { ...row, id } : null);
        },
        error,
      ),
    onNext,
    onError,
  );
}

/** `uid` has seen the thread up to now. Call on opening it and while it stays open. */
export async function markGroupChatRead(orgId: string, threadId: string, uid: string): Promise<void> {
  await setDoc(organizationChatReadWriteDoc(getDb(), orgId, threadId, uid), { readAt: serverTimestamp() });
}

