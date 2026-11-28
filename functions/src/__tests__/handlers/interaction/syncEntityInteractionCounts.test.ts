// Trigger tests for syncEntityCommentCount. Drives
// the handlers via firebase-functions-test's wrap()/makeChange() against the
// Firestore emulator (admin SDK env is wired up in setup/admin.setup.ts).
// Modeled on functions/src/__tests__/handlers/syncPersonDenormalization.test.ts.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncEntityCommentCount } from '../../../interaction/syncEntityInteractionCounts';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrappedComment = ft.wrap(syncEntityCommentCount);

const MUNICIPALITY_ID = 'm1';

interface CommentShape {
  entityKind: string;
  entityId: string;
  municipalityId: string;
  authorUserId: string;
  body: string;
  parentCommentId: string | null;
}

function comment(overrides: Partial<CommentShape> = {}): CommentShape {
  return {
    entityKind: 'event',
    entityId: 'e1',
    municipalityId: MUNICIPALITY_ID,
    authorUserId: 'user-1',
    body: 'hola',
    parentCommentId: null,
    ...overrides,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value ? (value as Record<string, unknown>) : {};
}

async function fireCommentTrigger(
  before: CommentShape | null,
  after: CommentShape | null,
  commentId = 'comment-1',
): Promise<void> {
  const beforeSnap = ft.firestore.makeDocumentSnapshot(asRecord(before), `comments/${commentId}`);
  const afterSnap = ft.firestore.makeDocumentSnapshot(asRecord(after), `comments/${commentId}`);
  const change = ft.makeChange(beforeSnap, afterSnap);
  await wrappedComment({ data: change, params: { commentId } });
}

async function seedEvent(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin.firestore().doc(`events/${id}`).set({ commentCount: 0, ...extra });
}

async function seedNews(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin.firestore().doc(`news/${id}`).set({ commentCount: 0, ...extra });
}

async function seedPlace(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}/places/${id}`)
    .set({ commentCount: 0, ...extra });
}

async function seedBarrio(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}/barrios/${id}`)
    .set({ commentCount: 0, ...extra });
}

async function seedOrganization(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin
    .firestore()
    .doc(`organizations/${id}`)
    .set({ commentCount: 0, membersPublic: true, ...extra });
}

async function seedFestivalPoster(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin
    .firestore()
    .doc(`festivalPosters/${id}`)
    .set({ commentCount: 0, ...extra });
}

beforeAll(async () => {
  await resetEmulators();
});

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('syncEntityCommentCount', () => {
  it('increments the parent commentCount on comment create', async () => {
    await seedEvent('e1');
    await fireCommentTrigger(null, comment());

    const eventDoc = await admin.firestore().doc('events/e1').get();
    expect(eventDoc.get('commentCount')).toBe(1);
  });

  it('decrements the parent commentCount on comment delete', async () => {
    await seedEvent('e1', { commentCount: 1 });
    await fireCommentTrigger(comment(), null);

    const eventDoc = await admin.firestore().doc('events/e1').get();
    expect(eventDoc.get('commentCount')).toBe(0);
  });

  it('routes place comments to municipalities/{municipalityId}/places/{entityId}', async () => {
    await seedPlace('p1');
    await fireCommentTrigger(null, comment({ entityKind: 'place', entityId: 'p1' }));

    const placeDoc = await admin
      .firestore()
      .doc(`municipalities/${MUNICIPALITY_ID}/places/p1`)
      .get();
    expect(placeDoc.get('commentCount')).toBe(1);
  });

  it('routes barrio comments to municipalities/{municipalityId}/barrios/{entityId}', async () => {
    await seedBarrio('b1');
    await fireCommentTrigger(null, comment({ entityKind: 'barrio', entityId: 'b1' }));

    const barrioDoc = await admin
      .firestore()
      .doc(`municipalities/${MUNICIPALITY_ID}/barrios/b1`)
      .get();
    expect(barrioDoc.get('commentCount')).toBe(1);
  });

  it('routes news comments to news/{entityId}', async () => {
    await seedNews('n1');
    await fireCommentTrigger(null, comment({ entityKind: 'news', entityId: 'n1' }));

    const newsDoc = await admin.firestore().doc('news/n1').get();
    expect(newsDoc.get('commentCount')).toBe(1);
  });

  it('routes organization comments to organizations/{entityId}', async () => {
    await seedOrganization('o1');
    await fireCommentTrigger(null, comment({ entityKind: 'organization', entityId: 'o1' }));

    const orgDoc = await admin.firestore().doc('organizations/o1').get();
    expect(orgDoc.get('commentCount')).toBe(1);
  });

  it('routes festivalPoster comments to festivalPosters/{entityId}', async () => {
    await seedFestivalPoster('fp1');
    await fireCommentTrigger(null, comment({ entityKind: 'festivalPoster', entityId: 'fp1' }));

    const festivalPosterDoc = await admin.firestore().doc('festivalPosters/fp1').get();
    expect(festivalPosterDoc.get('commentCount')).toBe(1);
  });

  it('no-ops without throwing for an unknown entityKind', async () => {
    await expect(
      fireCommentTrigger(null, comment({ entityKind: 'unknownKind', entityId: 'x1' })),
    ).resolves.not.toThrow();
  });

  it('swallows NOT_FOUND when the parent entity does not exist', async () => {
    // No seed for events/does-not-exist.
    await expect(
      fireCommentTrigger(null, comment({ entityKind: 'event', entityId: 'does-not-exist' })),
    ).resolves.not.toThrow();
  });
});

describe('syncEntityCommentCount — replies', () => {
  it('increments the parent comment replyCount on reply create', async () => {
    await seedEvent('e1');
    await admin.firestore().doc('comments/parent-1').set({ replyCount: 0 });
    await fireCommentTrigger(null, comment({ parentCommentId: 'parent-1' }), 'reply-1');

    const parentDoc = await admin.firestore().doc('comments/parent-1').get();
    expect(parentDoc.get('replyCount')).toBe(1);
    const eventDoc = await admin.firestore().doc('events/e1').get();
    expect(eventDoc.get('commentCount')).toBe(1);
  });

  it('decrements the parent comment replyCount on reply delete', async () => {
    await seedEvent('e1', { commentCount: 1 });
    await admin.firestore().doc('comments/parent-1').set({ replyCount: 1 });
    await fireCommentTrigger(comment({ parentCommentId: 'parent-1' }), null, 'reply-1');

    const parentDoc = await admin.firestore().doc('comments/parent-1').get();
    expect(parentDoc.get('replyCount')).toBe(0);
  });

  it('skips the replyCount when the parent comment is already gone (its delete cascades replies)', async () => {
    await seedEvent('e1', { commentCount: 1 });
    await expect(
      fireCommentTrigger(comment({ parentCommentId: 'gone-parent' }), null, 'reply-1'),
    ).resolves.not.toThrow();

    expect((await admin.firestore().doc('comments/gone-parent').get()).exists).toBe(false);
    expect((await admin.firestore().doc('events/e1').get()).get('commentCount')).toBe(0);
  });

  it('notifies the parent comment author on reply create', async () => {
    await seedEvent('e1', { title: 'Fiesta' });
    await admin.firestore().doc('comments/parent-1').set({
      ...comment(), authorUserId: 'parent-author', replyCount: 0,
    });
    await fireCommentTrigger(
      null,
      comment({ parentCommentId: 'parent-1', authorUserId: 'replier' }),
      'reply-1',
    );

    const notifs = await admin
      .firestore()
      .collection('users/parent-author/notifications')
      .get();
    expect(notifs.size).toBe(1);
    expect(notifs.docs[0].get('type')).toBe('comment_reply');
    expect(notifs.docs[0].get('entityKind')).toBe('event');
    expect(notifs.docs[0].get('entityId')).toBe('e1');
    expect(notifs.docs[0].get('municipalityId')).toBe(MUNICIPALITY_ID);
  });

  it('does not notify when replying to your own comment', async () => {
    await seedEvent('e1');
    await admin.firestore().doc('comments/parent-1').set({
      ...comment(), authorUserId: 'same-user', replyCount: 0,
    });
    await fireCommentTrigger(
      null,
      comment({ parentCommentId: 'parent-1', authorUserId: 'same-user' }),
      'reply-1',
    );

    const notifs = await admin
      .firestore()
      .collection('users/same-user/notifications')
      .get();
    expect(notifs.size).toBe(0);
  });

  it('cascade-deletes replies when their top-level parent is deleted', async () => {
    await seedEvent('e1', { commentCount: 3 });
    const replyA = comment({ parentCommentId: 'parent-1' });
    const replyB = comment({ parentCommentId: 'parent-1' });
    await admin.firestore().doc('comments/parent-1').set(comment());
    await admin.firestore().doc('comments/reply-a').set(replyA);
    await admin.firestore().doc('comments/reply-b').set(replyB);

    // The cascade only deletes the reply docs — in real production, Firestore
    // re-fires this same trigger for each deleted reply doc, which is what
    // performs its commentCount decrement. Simulate that re-firing explicitly
    // since this test harness doesn't dispatch real Firestore trigger events.
    await fireCommentTrigger(comment(), null, 'parent-1');
    await fireCommentTrigger(replyA, null, 'reply-a');
    await fireCommentTrigger(replyB, null, 'reply-b');

    const replyASnap = await admin.firestore().doc('comments/reply-a').get();
    const replyBSnap = await admin.firestore().doc('comments/reply-b').get();
    expect(replyASnap.exists).toBe(false);
    expect(replyBSnap.exists).toBe(false);
    const eventDoc = await admin.firestore().doc('events/e1').get();
    expect(eventDoc.get('commentCount')).toBe(0); // parent (-1) + 2 replies' own re-fired deletes (-2)
  });
});
