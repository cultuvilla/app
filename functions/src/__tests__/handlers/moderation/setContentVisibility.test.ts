// Handler test for the setContentVisibility callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { wrapCallable } from '../../helpers/functionsTest';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { setContentVisibility } from '../../../moderation/setContentVisibility';

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

async function seedNewsPost(postId: string): Promise<void> {
  const now = new Date();
  await admin
    .firestore()
    .doc(`news/${postId}`)
    .set({
      municipalityId: MUNICIPALITY_ID,
      createdBy: 'author-1',
      organizerUserIds: ['author-1'],
      organizerOrgIds: [],
      title: 'Fiesta del pueblo',
      body: 'Descripción',
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

interface CallableResult {
  status: 'active' | 'hidden';
}

async function callSetVisibility(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = wrapCallable(ft, setContentVisibility);
  return await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  });
}

describe('setContentVisibility (callable)', () => {
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
      callSetVisibility({ uid: null, data: { collection: 'news', docId: 'p1', hidden: true } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws invalid-argument for an unknown collection', async () => {
    await seedMember(ADMIN_UID, 'admin');
    await expect(
      callSetVisibility({
        uid: ADMIN_UID,
        data: { collection: 'organizations', docId: 'p1', hidden: true },
      }),
    ).rejects.toThrow(/inválidos|invalid-argument/i);
  });

  it('throws permission-denied for a non-admin caller', async () => {
    await seedNewsPost('p1');
    await expect(
      callSetVisibility({
        uid: OUTSIDER_UID,
        data: { collection: 'news', docId: 'p1', hidden: true },
      }),
    ).rejects.toThrow(/autorizado|permission-denied/i);
  });

  it('throws not-found for a missing target doc', async () => {
    await seedMember(ADMIN_UID, 'admin');
    await expect(
      callSetVisibility({
        uid: ADMIN_UID,
        data: { collection: 'news', docId: 'does-not-exist', hidden: true },
      }),
    ).rejects.toThrow(/no encontrado|not-found/i);
  });

  it('admin hides an active news post and logs a moderationEvents entry', async () => {
    await seedMember(ADMIN_UID, 'admin');
    await seedNewsPost('p1');

    const result = await callSetVisibility({
      uid: ADMIN_UID,
      data: { collection: 'news', docId: 'p1', hidden: true, reason: 'spam' },
    });
    expect(result.status).toBe('hidden');

    const snap = await admin.firestore().doc('news/p1').get();
    expect(snap.data()?.status).toBe('hidden');
    expect(snap.data()?.hiddenBy).toBe(ADMIN_UID);
    expect(snap.data()?.hiddenAt).not.toBeNull();
    expect(snap.data()?.hiddenReason).toBe('spam');

    const eventsSnap = await admin
      .firestore()
      .collection('moderationEvents')
      .where('docId', '==', 'p1')
      .get();
    expect(eventsSnap.size).toBe(1);
    const event = eventsSnap.docs[0].data();
    expect(event.action).toBe('hide');
    expect(event.collection).toBe('news');
    expect(event.municipalityId).toBe(MUNICIPALITY_ID);
    expect(event.actorUserId).toBe(ADMIN_UID);
    expect(event.reason).toBe('spam');
  });

  it('admin unhides a hidden news post', async () => {
    await seedMember(ADMIN_UID, 'admin');
    await seedNewsPost('p1');
    await admin
      .firestore()
      .doc('news/p1')
      .update({ status: 'hidden', hiddenBy: ADMIN_UID, hiddenAt: new Date(), hiddenReason: 'spam' });

    const result = await callSetVisibility({
      uid: ADMIN_UID,
      data: { collection: 'news', docId: 'p1', hidden: false },
    });
    expect(result.status).toBe('active');

    const snap = await admin.firestore().doc('news/p1').get();
    expect(snap.data()?.status).toBe('active');
    expect(snap.data()?.hiddenBy).toBeNull();
    expect(snap.data()?.hiddenAt).toBeNull();
    expect(snap.data()?.hiddenReason).toBeNull();

    const eventsSnap = await admin
      .firestore()
      .collection('moderationEvents')
      .where('docId', '==', 'p1')
      .where('action', '==', 'unhide')
      .get();
    expect(eventsSnap.size).toBe(1);
  });
});
