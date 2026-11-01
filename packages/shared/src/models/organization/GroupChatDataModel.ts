import { z } from 'zod';

/**
 * A group's chat: one thread under each aviso, and one general thread
 * ("Charla") for the whole group. Private to the group — unlike `comments/`,
 * which is public and village-scoped.
 *
 * - `organizations/{orgId}/chat/{chatId}` — the general thread. Every member
 *   reads it; every member writes, unless the group set `chatAdminsOnly`.
 * - `organizations/{orgId}/messages/{messageId}/chat/{chatId}` — an aviso's
 *   thread. Whoever reads the aviso (its recipients, and the admins) reads and
 *   writes it.
 * - `organizations/{orgId}/chatThreads/{threadId}` — per thread, when it last
 *   moved and who wrote last. Function-owned (`onGroupChatMessageCreated`); the
 *   id is the aviso's or `general`.
 * - `organizations/{orgId}/chatThreads/{threadId}/reads/{uid}` — when a reader
 *   last opened the thread. Moves forward on every open; the unread badge
 *   compares it with the thread's `lastMessageAt`.
 *
 * A message is never edited. Its author deletes it, and so may the group's
 * admins (and the village's and the app's). It carries the author's name as it
 * was when written, so it stays readable after the author leaves the group.
 * Nothing notifies unless a member opts in (`groupPrefs.chatPush`).
 */

export const GROUP_CHAT_BODY_MAX = 2000;
/** The general thread's id in `chatThreads`. Aviso ids are 10–40 alphanumerics, so they never collide. */
export const GENERAL_CHAT_THREAD_ID = 'general';
/** A message's document path: what a report of it names, since its moderators cannot open it. */
export function groupChatMessagePath(orgId: string, threadId: string, chatId: string): string {
  return isGeneralChatThread(threadId)
    ? `organizations/${orgId}/chat/${chatId}`
    : `organizations/${orgId}/messages/${threadId}/chat/${chatId}`;
}

/** How many messages a thread shows before "ver anteriores". */
export const GROUP_CHAT_PAGE_SIZE = 50;

export function isGeneralChatThread(threadId: string): boolean {
  return threadId === GENERAL_CHAT_THREAD_ID;
}

export const GroupChatMessageDataSchema = z.object({
  authorUid: z.string(),
  /** The author's `publicProfiles` name when they wrote it — the rules check it. */
  authorName: z.string(),
  body: z.string(),
  createdAt: z.date(),
});
export type GroupChatMessageData = z.infer<typeof GroupChatMessageDataSchema>;

export const GroupChatThreadDataSchema = z.object({
  lastMessageAt: z.date(),
  lastAuthorUid: z.string(),
});
export type GroupChatThreadData = z.infer<typeof GroupChatThreadDataSchema>;

export const GroupChatReadDataSchema = z.object({
  readAt: z.date(),
});
export type GroupChatReadData = z.infer<typeof GroupChatReadDataSchema>;

/** A message as the composer sends it: trimmed, non-empty, within the limit. */
export const GroupChatBodySchema = z.string().trim().min(1).max(GROUP_CHAT_BODY_MAX);

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Whether a thread has something `uid` has not seen: a message after their last
 * open, written by someone else. Writing counts as having read what came
 * before, so a thread whose last word is yours is never unread.
 */
export function isGroupChatThreadUnread(
  thread: Pick<GroupChatThreadData, 'lastMessageAt' | 'lastAuthorUid'> | null,
  read: Pick<GroupChatReadData, 'readAt'> | null,
  uid: string,
): boolean {
  if (!thread || thread.lastAuthorUid === uid) return false;
  return !read || read.readAt.getTime() < thread.lastMessageAt.getTime();
}

/** How many of these threads are unread for `uid`. Threads and reads are keyed by thread id. */
export function countUnreadGroupChatThreads(
  threads: Iterable<Pick<GroupChatThreadData, 'lastMessageAt' | 'lastAuthorUid'> & { id: string }>,
  reads: Iterable<Pick<GroupChatReadData, 'readAt'> & { id: string }>,
  uid: string,
): number {
  const readById = new Map<string, Pick<GroupChatReadData, 'readAt'>>();
  for (const r of reads) readById.set(r.id, r);
  let unread = 0;
  for (const t of threads) if (isGroupChatThreadUnread(t, readById.get(t.id) ?? null, uid)) unread += 1;
  return unread;
}

/** The push's body: "Ana: …", the message cut to a preview. */
export function groupChatPushBody(authorName: string, body: string, max = 140): string {
  const text = body.trim().replace(/\s+/g, ' ');
  const cut = text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  return `${authorName}: ${cut}`;
}
