// Handler test for the deleteNewsPost callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { wrapCallable } from '../../helpers/functionsTest';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { deleteNewsPost } from '../../../news/deleteNewsPost';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const ADMIN_UID = 'vadmin';
const OUTSIDER_UID = 'eve';

async function seedMember(uid: string, role: 'admin' | 'user'): Promise<void> {
  await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}/members/${uid}`)
    .set({
      userId: uid,
      role,
      joinedAt: new Date(),
      profileAnswers: {},
      profileCompletedAt: null,
    });
}

async function seedPost(postId: string): Promise<void> {
  const now = new Date();
  await admin.firestore().doc(`news/${postId}`).set({
    municipalityId: MUNICIPALITY_ID,
    createdBy: 'author-1',
    organizerUserIds: ['author-1'],
    organizerOrgIds: [],
    title: 'Test post',
    body: 'Body',
    category: 'fiesta',
    villageSlug: 'villarriba',
    images: [],
    status: 'active',
    hiddenBy: null,
    hiddenAt: null,
    hiddenReason: null,
    createdAt: now,
    publishedAt: now,
    updatedAt: now,
    readCount: 0,
    commentCount: 0,
  });
}

async function seedComment(commentId: string, postId: string): Promise<void> {
  await admin.firestore().doc(`comments/${commentId}`).set({
    entityKind: 'news',
    entityId: postId,
    municipalityId: MUNICIPALITY_ID,
    authorUserId: 'user-1',
    body: 'A comment',
    createdAt: new Date(),
  });
}

interface CallableResult {
  ok: true;
}

async function callDelete(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = wrapCallable(ft, deleteNewsPost);
  return await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  });
}

describe('deleteNewsPost (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('throws unauthenticated when no auth context', async () => {
    await expect(
      callDelete({ uid: null, data: { postId: 'p1' } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws permission-denied for non-admin caller', async () => {
    await seedPost('p1');
    await expect(
      callDelete({ uid: OUTSIDER_UID, data: { postId: 'p1' } }),
    ).rejects.toThrow(/autorizado|permission-denied/i);
  });

  it('throws not-found when post does not exist', async () => {
    await seedMember(ADMIN_UID, 'admin');
    await expect(
      callDelete({ uid: ADMIN_UID, data: { postId: 'nonexistent' } }),
    ).rejects.toThrow(/encontrado|not.?found/i);
  });

  it('author can delete their own post (no admin role required)', async () => {
    await seedPost('p1'); // createdBy: 'author-1'
    await seedComment('c1', 'p1');
    const result = await callDelete({ uid: 'author-1', data: { postId: 'p1' } });
    expect(result.ok).toBe(true);
    expect((await admin.firestore().doc('news/p1').get()).exists).toBe(false);
    expect((await admin.firestore().doc('comments/c1').get()).exists).toBe(false);
  });

  it('admin deletes post with cascade: comments removed', async () => {
    await seedMember(ADMIN_UID, 'admin');
    await seedPost('p1');
    await seedComment('c1', 'p1');
    await seedComment('c2', 'p1');

    const result = await callDelete({ uid: ADMIN_UID, data: { postId: 'p1' } });
    expect(result.ok).toBe(true);

    // Post should be deleted
    const postSnap = await admin.firestore().doc('news/p1').get();
    expect(postSnap.exists).toBe(false);

    // Comments should be deleted
    const c1 = await admin.firestore().doc('comments/c1').get();
    const c2 = await admin.firestore().doc('comments/c2').get();
    expect(c1.exists).toBe(false);
    expect(c2.exists).toBe(false);
  });
});
