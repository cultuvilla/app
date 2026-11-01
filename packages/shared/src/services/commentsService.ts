import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit as fsLimit,
} from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import { commentsCollection, commentDoc } from '../firebase/refs/client';
import { buildCommentData, type CommentData } from '../models/interaction/CommentDataModel';
import type { EntityKind } from '../models/interaction/EntityKind';

export interface AddCommentInput {
  /** From `newCommentId`, for a caller that shows the comment before the write settles. */
  id?: string;
  entityKind: EntityKind;
  entityId: string;
  municipalityId: string;
  authorUserId: string;
  body: string;
  parentCommentId?: string | null;
}

export function newCommentId(): string {
  return doc(commentsCollection(getDb())).id;
}

// Resolves on the server's ack, not on the local write: offline, or behind a long
// write queue, that is arbitrarily late. Don't block a UI on it.
export async function addComment(input: AddCommentInput): Promise<string> {
  const comments = commentsCollection(getDb());
  const ref = input.id ? doc(comments, input.id) : doc(comments);
  await setDoc(
    ref,
    buildCommentData({
      entityKind: input.entityKind,
      entityId: input.entityId,
      municipalityId: input.municipalityId,
      authorUserId: input.authorUserId,
      body: input.body,
      createdAt: new Date(),
      parentCommentId: input.parentCommentId ?? null,
    }),
  );
  return ref.id;
}

export async function getComment(commentId: string): Promise<(CommentData & { id: string }) | null> {
  const snap = await getDoc(commentDoc(getDb(), commentId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function deleteComment(commentId: string): Promise<void> {
  await deleteDoc(commentDoc(getDb(), commentId));
}

export async function getComments(
  entityKind: EntityKind,
  entityId: string,
  options: { limit?: number } = {},
): Promise<(CommentData & { id: string })[]> {
  const constraints = [
    where('entityKind', '==', entityKind),
    where('entityId', '==', entityId),
    where('parentCommentId', '==', null),
    orderBy('createdAt', 'asc'),
    ...(options.limit ? [fsLimit(options.limit)] : []),
  ];
  const q = query(commentsCollection(getDb()), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getReplies(
  entityKind: EntityKind,
  entityId: string,
  parentCommentId: string,
): Promise<(CommentData & { id: string })[]> {
  const q = query(
    commentsCollection(getDb()),
    where('entityKind', '==', entityKind),
    where('entityId', '==', entityId),
    where('parentCommentId', '==', parentCommentId),
    orderBy('createdAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export interface RecordEntityViewInput {
  entityKind: EntityKind;
  entityId: string;
  municipalityId: string;
}

export async function recordEntityView(input: RecordEntityViewInput): Promise<void> {
  const fn = httpsCallable<RecordEntityViewInput>(getFirebaseFunctions(), 'recordEntityView');
  await fn(input);
}
