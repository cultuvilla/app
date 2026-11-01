import { useMemo } from 'react';
import { GENERAL_CHAT_THREAD_ID, isGroupChatThreadUnread } from '@cultuvilla/shared/models/organization';
import {
  watchGroupChatThreads,
  watchMyGroupChatReads,
  type GroupChatRead,
  type GroupChatThread,
} from '@cultuvilla/shared/services/groupChatService';
import { useWatch } from '../hooks/useWatch';

export interface GroupChatUnread {
  generalUnread: boolean;
  /** The avisos, of those given, whose thread has something new. */
  unreadAvisoIds: Set<string>;
}

/**
 * Which of a group's chats have something the user has not seen — the badges on
 * its tiles and notices. Everyone gets these: a badge is not a notification, so
 * it does not depend on the chat opt-in. A null `uid` reads nothing.
 */
export function useGroupChatUnread(orgId: string, uid: string | null, avisoIds: string[]): GroupChatUnread {
  const threadIds = useMemo(() => [GENERAL_CHAT_THREAD_ID, ...avisoIds], [avisoIds]);
  const key = uid ? `${orgId}|${uid}|${threadIds.join(',')}` : null;
  const threads = useWatch<GroupChatThread[]>(
    'groups:watchGroupChatThreads',
    key,
    uid ? (next, error) => watchGroupChatThreads(orgId, threadIds, next, error) : null,
  );
  const reads = useWatch<GroupChatRead[]>(
    'groups:watchMyGroupChatReads',
    key,
    uid ? (next, error) => watchMyGroupChatReads(orgId, uid, threadIds, next, error) : null,
  );
  return useMemo(() => {
    const out: GroupChatUnread = { generalUnread: false, unreadAvisoIds: new Set() };
    // Until the reads load, every thread would look unread.
    if (!uid || reads.status !== 'ready') return out;
    const readOf = new Map((reads.data ?? []).map((r) => [r.id, r]));
    for (const thread of threads.data ?? []) {
      if (!isGroupChatThreadUnread(thread, readOf.get(thread.id) ?? null, uid)) continue;
      if (thread.id === GENERAL_CHAT_THREAD_ID) out.generalUnread = true;
      else out.unreadAvisoIds.add(thread.id);
    }
    return out;
  }, [uid, threads.data, reads.data, reads.status]);
}
