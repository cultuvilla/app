import { useMemo } from 'react';
import {
  watchMyGroupMessageReads,
  watchMyGroupMessages,
  type GroupMessage,
  type GroupMessageRead,
} from '@cultuvilla/shared/services/groupMessageService';
import { useWatch, type WatchStatus } from '../hooks/useWatch';

/** Pinned first, then newest. */
function noticeOrder(a: GroupMessage, b: GroupMessage): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.sentAt.getTime() - a.sentAt.getTime();
}

export interface GroupNoticesState {
  notices: GroupMessage[];
  status: WatchStatus;
  readsStatus: WatchStatus;
  readIds: Set<string>;
  /** Notices from someone else the user has not opened; 0 until the reads load. */
  unreadCount: number;
}

/**
 * The notices that reached the user and which of them they have read — the
 * notices screen and the home's badge. A null `uid` reads nothing (an org with
 * no messaging).
 */
export function useGroupNotices(orgId: string, uid: string | null): GroupNoticesState {
  const messages = useWatch<GroupMessage[]>(
    'groups:watchMyGroupMessages',
    uid ? `${orgId}|${uid}` : null,
    uid ? (next, error) => watchMyGroupMessages(orgId, uid, next, error) : null,
  );
  const notices = useMemo(() => [...(messages.data ?? [])].sort(noticeOrder), [messages.data]);
  const ids = useMemo(() => notices.map((m) => m.id), [notices]);
  const idsKey = ids.join(',');
  const reads = useWatch<GroupMessageRead[]>(
    'groups:watchMyGroupMessageReads',
    uid && ids.length > 0 ? `${orgId}|${uid}|${idsKey}` : null,
    uid && ids.length > 0 ? (next, error) => watchMyGroupMessageReads(orgId, uid, ids, next, error) : null,
  );
  const readIds = useMemo(() => new Set((reads.data ?? []).map((r) => r.id)), [reads.data]);
  const unreadCount =
    reads.status === 'ready' ? notices.filter((m) => !readIds.has(m.id) && m.sentBy !== uid).length : 0;
  return { notices, status: messages.status, readsStatus: reads.status, readIds, unreadCount };
}
