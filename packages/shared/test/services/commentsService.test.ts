// Exercises commentsService against the shared in-memory Firestore fake (see
// ../helpers/fakeFirestore) — same harness pattern as newsService.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => createFakeFirestoreModule());
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { httpsCallable } from 'firebase/functions';
import {
  addComment,
  deleteComment,
  getComments,
  getReplies,
  newCommentId,
  recordEntityView,
} from '../../src/services/commentsService';

describe('commentsService — comments', () => {
  beforeEach(() => {
    resetFakeFirestore();
  });

  it('addComment writes a doc under comments/* with entityKind/entityId/body', async () => {
    const id = await addComment({
      entityKind: 'event',
      entityId: 'e1',
      municipalityId: 'm1',
      authorUserId: 'u1',
      body: 'Nos vemos allí!',
    });
    expect(id).toBeTruthy();
    const snap = fakeStore()[`comments/${id}`];
    expect(snap).toBeDefined();
    expect(snap['entityKind']).toBe('event');
    expect(snap['entityId']).toBe('e1');
    expect(snap['body']).toBe('Nos vemos allí!');
  });

  it('addComment writes under a caller-chosen id from newCommentId', async () => {
    const chosen = newCommentId();
    const id = await addComment({
      id: chosen, entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'X',
    });
    expect(id).toBe(chosen);
    expect(fakeStore()[`comments/${chosen}`]).toBeDefined();
    expect(fakeStore()[`comments/${chosen}`]['id']).toBeUndefined();
  });

  it('deleteComment removes the comment doc', async () => {
    const id = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'X',
    });
    expect(fakeStore()[`comments/${id}`]).toBeDefined();
    await deleteComment(id);
    expect(fakeStore()[`comments/${id}`]).toBeUndefined();
  });

  it('getComments(event, e1) returns only comments for that entity', async () => {
    const id1 = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'First',
    });
    const id2 = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u2', body: 'Second',
    });
    // Different entityId, same kind
    await addComment({
      entityKind: 'event', entityId: 'e2', municipalityId: 'm1', authorUserId: 'u1', body: 'Other event',
    });
    // Same entityId, different kind
    await addComment({
      entityKind: 'place', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'Other kind',
    });

    const comments = await getComments('event', 'e1');
    const ids = comments.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([id1, id2]));
    expect(ids.length).toBe(2);
    expect(comments.every((c) => c.entityKind === 'event' && c.entityId === 'e1')).toBe(true);
  });

  it('addComment defaults parentCommentId to null and replyCount to 0', async () => {
    const id = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'X',
    });
    const snap = fakeStore()[`comments/${id}`];
    expect(snap['parentCommentId']).toBeNull();
    expect(snap['replyCount']).toBe(0);
  });

  it('addComment accepts an explicit parentCommentId for a reply', async () => {
    const parentId = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'Parent',
    });
    const replyId = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u2', body: 'Reply',
      parentCommentId: parentId,
    });
    expect(fakeStore()[`comments/${replyId}`]['parentCommentId']).toBe(parentId);
  });

  it('getComments excludes replies (only parentCommentId === null)', async () => {
    const parentId = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'Parent',
    });
    await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u2', body: 'Reply',
      parentCommentId: parentId,
    });
    const comments = await getComments('event', 'e1');
    expect(comments.map((c) => c.id)).toEqual([parentId]);
  });

  it('getReplies returns only replies to the given parent, oldest first', async () => {
    const parentId = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'Parent',
    });
    const otherParentId = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u1', body: 'Other parent',
    });
    const reply1 = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u2', body: 'R1',
      parentCommentId: parentId,
    });
    const reply2 = await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u3', body: 'R2',
      parentCommentId: parentId,
    });
    await addComment({
      entityKind: 'event', entityId: 'e1', municipalityId: 'm1', authorUserId: 'u4', body: 'Not ours',
      parentCommentId: otherParentId,
    });

    const replies = await getReplies('event', 'e1', parentId);
    expect(replies.map((r) => r.id)).toEqual([reply1, reply2]);
  });
});

describe('commentsService — recordEntityView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordEntityView calls the recordEntityView callable with entity coords', async () => {
    const callable = vi.fn().mockResolvedValue({ data: undefined });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    await recordEntityView({ entityKind: 'event', entityId: 'e1', municipalityId: 'm1' });

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'recordEntityView');
    expect(callable).toHaveBeenCalledWith({ entityKind: 'event', entityId: 'e1', municipalityId: 'm1' });
  });
});
