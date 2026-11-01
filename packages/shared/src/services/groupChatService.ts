// packages/shared/src/services/groupChatService.ts
import { deleteDoc, doc, limit, orderBy, query, serverTimestamp, setDoc } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import {
  organizationChatCollection,
  organizationChatReadDoc,
  organizationChatReadWriteDoc,
  organizationChatThreadDoc,
  organizationChatWriteCollection,
  organizationChatWriteDoc,
  userGroupPrefsDoc,
} from '../firebase/refs/client';
import {
  GroupChatBodySchema,
  type GroupChatMessageData,
  type GroupChatReadData,
  type GroupChatThreadData,
} from '../models/organization/GroupChatDataModel';
import type { GroupNotificationPrefsData } from '../models/notification/NotificationPrefsDataModel';
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
}

/**
 * Write a message. Throws on an empty or over-long body before writing. The
 * rules refuse a writer who may not read the thread, and a non-admin in a
 * general chat set to "solo la junta escribe". Returns the new message's id.
 */
export async function sendGroupChatMessage(input: SendGroupChatMessageInput): Promise<string> {
  const body = GroupChatBodySchema.parse(input.body);
  const ref = doc(organizationChatWriteCollection(getDb(), input.orgId, input.threadId));
  await setDoc(ref, {
    authorUid: input.uid,
    authorName: input.authorName,
    body,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** The author removes their own message; an admin removes anyone's. There is no edit. */
export async function deleteGroupChatMessage(orgId: string, threadId: string, chatId: string): Promise<void> {
  await deleteDoc(organizationChatWriteDoc(getDb(), orgId, threadId, chatId));
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

// =============================================================================
// PUSH — the general chat's per-group opt-in
// =============================================================================

/**
 * Opt in to (or out of) pushes for the group's general chat. Keeps the
 * group's mute as `current` has it — pass the prefs `watchGroupNotificationPrefs`
 * last gave (null = never set).
 */
export async function setGroupGeneralChatPush(
  uid: string,
  orgId: string,
  on: boolean,
  current: Pick<GroupNotificationPrefsData, 'messagesMuted'> | null,
): Promise<void> {
  await setDoc(
    userGroupPrefsDoc(getDb(), uid, orgId).withConverter(null),
    { messagesMuted: current?.messagesMuted ?? false, generalChatPush: on, updatedAt: new Date() },
    { merge: true },
  );
}
