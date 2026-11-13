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
 * - `organizations/{orgId}/tasks/{taskId}/chat/{chatId}` — a task's comments.
 *   Every member reads and writes them. They keep no thread summary: a task has
 *   no unread badge, and `onTaskCommentCreated` only pushes.
 * - `organizations/{orgId}/chatThreads/{threadId}` — per thread, when it last
 *   moved and who wrote last. Function-owned (`onGroupChatMessageCreated`); the
 *   id is the aviso's or `general`.
 * - `organizations/{orgId}/chatThreads/{threadId}/reads/{uid}` — when a reader
 *   last opened the thread. Moves forward on every open; the unread badge
 *   compares it with the thread's `lastMessageAt`.
 *
 * A message's text is never edited. Its author deletes it, and so may the
 * group's admins (and the village's and the app's). It carries the author's
 * name as it was when written, so it stays readable after the author leaves the
 * group. Whoever reads the thread may react to it (`reactions`, one per reader)
 * — the only change a message ever takes — and a message may quote the one it
 * answers (`replyTo`), copied whole so the quote survives paging. Both fields
 * are optional: older messages, and older binaries, never carry them.
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

/** Reads a report's target back into a message, or null for a report of anything else. */
export function parseGroupChatMessagePath(
  path: string,
): { orgId: string; threadId: string; chatId: string } | null {
  const general = /^organizations\/([^/]+)\/chat\/([^/]+)$/.exec(path);
  if (general?.[1] && general[2]) return { orgId: general[1], threadId: GENERAL_CHAT_THREAD_ID, chatId: general[2] };
  const aviso = /^organizations\/([^/]+)\/messages\/([^/]+)\/chat\/([^/]+)$/.exec(path);
  if (aviso?.[1] && aviso[2] && aviso[3]) return { orgId: aviso[1], threadId: aviso[2], chatId: aviso[3] };
  return null;
}

/** How many messages a thread shows before "ver anteriores". */
export const GROUP_CHAT_PAGE_SIZE = 50;

export function isGeneralChatThread(threadId: string): boolean {
  return threadId === GENERAL_CHAT_THREAD_ID;
}

/**
 * The reactions a reader may leave, in the order the app offers them. The
 * rules hold the same list (`groupChatReactions()` in firestore.rules).
 */
export const GROUP_CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏'] as const;
export type GroupChatReaction = (typeof GROUP_CHAT_REACTIONS)[number];

/** The message a reply answers, as it was: the rules check it against the original. */
export const GroupChatReplySchema = z.object({
  chatId: z.string(),
  authorUid: z.string(),
  authorName: z.string(),
  body: z.string(),
});
export type GroupChatReply = z.infer<typeof GroupChatReplySchema>;

export const GroupChatMessageDataSchema = z.object({
  authorUid: z.string(),
  /** The author's `publicProfiles` name when they wrote it — the rules check it. */
  authorName: z.string(),
  body: z.string(),
  createdAt: z.date(),
  replyTo: GroupChatReplySchema.optional(),
  /** Reader uid → their one reaction. A plain string, so a reaction added later never fails an older converter. */
  reactions: z.record(z.string(), z.string()).optional(),
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

/** One reaction under a message: how many left it, and whether the viewer is one of them. */
export interface GroupChatReactionCount {
  emoji: GroupChatReaction;
  count: number;
  mine: boolean;
}

/** The reactions a message shows, in the offered order; unknown ones are left out. */
export function groupChatReactionCounts(
  reactions: Record<string, string> | undefined,
  uid: string,
): GroupChatReactionCount[] {
  if (!reactions) return [];
  const known = new Set<string>(GROUP_CHAT_REACTIONS);
  const counts = new Map<string, number>();
  for (const emoji of Object.values(reactions)) if (known.has(emoji)) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  const mine = reactions[uid];
  return GROUP_CHAT_REACTIONS.filter((e) => counts.has(e)).map((emoji) => ({
    emoji,
    count: counts.get(emoji) ?? 0,
    mine: mine === emoji,
  }));
}

/** The viewer's reaction, or null. A tap on the one they already left takes it away. */
export function nextGroupChatReaction(current: string | undefined, picked: GroupChatReaction): GroupChatReaction | null {
  return current === picked ? null : picked;
}

function localDayKey(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1)}-${String(date.getDate())}`;
}

/** How a message sits in the thread: under a day separator, and whether it starts a run of one author's messages. */
export interface GroupChatRowLayout {
  /** The first message of its day: a separator goes above it. */
  newDay: boolean;
  /** The first of consecutive messages by one author on one day: their name and initial go on it. */
  firstOfRun: boolean;
}

/**
 * Layout for a thread's messages, given newest first (as `watchGroupChat`
 * returns them). Each row looks at the one written before it — the next in the
 * array — so a page's oldest message always opens a day and a run.
 */
export function groupChatLayout(
  rows: readonly Pick<GroupChatMessageData, 'authorUid' | 'createdAt'>[],
): GroupChatRowLayout[] {
  return rows.map((row, i) => {
    const before = i + 1 < rows.length ? rows[i + 1] : undefined;
    const newDay = !before || localDayKey(before.createdAt) !== localDayKey(row.createdAt);
    return { newDay, firstOfRun: newDay || before.authorUid !== row.authorUid };
  });
}

/** A stable slot in a palette of `size` colours for a person, so their initial keeps its colour. */
export function groupChatAuthorColorIndex(uid: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  return Math.abs(hash) % size;
}
