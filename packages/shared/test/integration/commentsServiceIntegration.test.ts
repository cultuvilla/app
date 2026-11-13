// Integration test for commentsService against the real Firestore emulator.
//
// Group 1 exercises the service itself (addComment/getComments/deleteComment)
// through the real query/index path — the composite index on
// comments(entityKind, entityId, createdAt) is declared in
// firestore.indexes.json but a mocked-Firestore unit test
// (commentsService.test.ts) can never prove it actually satisfies the query.
//
// Group 2 is the reason this file boots the full harness (auth + firestore +
// functions + storage, see scripts/run-tests-with-emulators.mjs): it writes
// through the real service, lets the deployed syncEntityCommentCount trigger
// (functions/src/interaction/syncEntityInteractionCounts.ts) react to the
// Firestore write, and polls the parent entity doc until the denormalized
// counter settles. This is the only place that proves the trigger round-trip
// end-to-end.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { doc, setDoc, getDoc, type Firestore } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, seed } from '../helpers/roles';
import {
  addComment,
  deleteComment,
  getComments,
} from '../../src/services/commentsService';
import { eventsCollection, eventDoc, municipalityPlacesCollection, municipalityPlaceDoc } from '../../src/firebase/refs/client';
import { buildEventData } from '../../src/models/event/EventDataModel';
import { buildPlaceData } from '../../src/models/municipality/MunicipalityDataModel';
import * as firebaseModule from '../../src/firebase';

const getEnv = useRulesTestEnv();

function useDbAs(uid: string): void {
  vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asUser(getEnv(), uid));
}

afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(() => {
  vi.restoreAllMocks();
});

const TRIGGER_POLL_MS = 60_000;

/**
 * Polls `read()` until `predicate` is satisfied or `timeoutMs` elapses.
 * Triggers run asynchronously in the emulator, so assertions on
 * function-written fields (commentCount) can't be made synchronously after
 * the service call that provoked them. The limit is generous because the suite
 * shares one emulator with the rules tests, whose seeds queue thousands of
 * trigger runs: this waits out that backlog, it does not measure the trigger.
 */
async function pollUntil<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  { timeoutMs = TRIGGER_POLL_MS, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const start = Date.now();
  let last: T = await read();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`pollUntil: condition not met within ${String(timeoutMs)}ms (last value: ${JSON.stringify(last)})`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    last = await read();
  }
  return last;
}

function testEventData(municipalityId: string) {
  return buildEventData({
    title: 'Fiesta del pueblo',
    description: 'Test event for comments integration',
    startDate: new Date(),
    location: { coordinates: { lat: 40.0, lng: -3.0 }, displayName: 'Plaza Mayor' },
    organizerUserIds: [],
    organizerOrgIds: [],
    createdBy: 'admin',
    municipalityId,
    villageName: 'Villatest',
    villageSlug: 'villatest',
    villageCoordinates: null,
  });
}

function testPlaceData(municipalityId: string) {
  return buildPlaceData({
    name: 'Ermita del Cristo',
    kind: 'hermitage',
    municipalityId,
    status: 'approved',
    proposedBy: 'admin',
  });
}

async function seedEvent(municipalityId: string): Promise<string> {
  let eventId = '';
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const ref = doc(eventsCollection(db));
    await setDoc(ref, testEventData(municipalityId));
    eventId = ref.id;
  });
  return eventId;
}

async function readEventCounters(municipalityId: string, eventId: string) {
  let data: { commentCount: number } | undefined;
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const snap = await getDoc(eventDoc(db, eventId));
    if (!snap.exists()) throw new Error(`event ${eventId} not found (municipality ${municipalityId})`);
    data = { commentCount: snap.data().commentCount };
  });
  if (!data) throw new Error('readEventCounters: seed callback did not run');
  return data;
}

async function seedPlace(municipalityId: string): Promise<string> {
  let placeId = '';
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const ref = doc(municipalityPlacesCollection(db, municipalityId));
    await setDoc(ref, testPlaceData(municipalityId));
    placeId = ref.id;
  });
  return placeId;
}

async function readPlaceCommentCount(municipalityId: string, placeId: string): Promise<number> {
  let commentCount: number | undefined;
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const snap = await getDoc(municipalityPlaceDoc(db, municipalityId, placeId));
    if (!snap.exists()) throw new Error(`place ${placeId} not found (municipality ${municipalityId})`);
    commentCount = snap.data().commentCount;
  });
  if (commentCount === undefined) throw new Error('readPlaceCommentCount: seed callback did not run');
  return commentCount;
}

describe('commentsService — real Firestore (comments)', () => {
  // A comment create is now anchored to its target entity: the rule's
  // commentTargetsClaimedVillage() requires the referenced event/place to exist
  // under the claimed municipality. These service-level tests use fixed entity
  // ids, so seed those targets (rules disabled) after the per-test
  // clearFirestore, or every addComment is denied.
  const M1_EVENT_TARGETS = ['e-solo', 'e-order', 'e-scope', 'e-other', 'e-delete'];
  beforeEach(async () => {
    await seed(getEnv(), async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      for (const id of M1_EVENT_TARGETS) {
        await setDoc(eventDoc(db, id), testEventData('m1'));
      }
      await setDoc(municipalityPlaceDoc(db, 'm1', 'e-scope'), testPlaceData('m1'));
    });
  });

  it('addComment then getComments returns the comment with a real Date createdAt', async () => {
    useDbAs('alice');
    const id = await addComment({
      entityKind: 'event',
      entityId: 'e-solo',
      municipalityId: 'm1',
      authorUserId: 'alice',
      body: 'Qué ganas de que llegue!',
    });

    const comments = await getComments('event', 'e-solo');
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe(id);
    expect(comments[0].body).toBe('Qué ganas de que llegue!');
    expect(comments[0].authorUserId).toBe('alice');
    expect(comments[0].createdAt).toBeInstanceOf(Date);
  });

  it('getComments orders by createdAt ascending (proves the composite index)', async () => {
    useDbAs('alice');
    const id1 = await addComment({
      entityKind: 'event', entityId: 'e-order', municipalityId: 'm1', authorUserId: 'alice', body: 'First',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const id2 = await addComment({
      entityKind: 'event', entityId: 'e-order', municipalityId: 'm1', authorUserId: 'alice', body: 'Second',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const id3 = await addComment({
      entityKind: 'event', entityId: 'e-order', municipalityId: 'm1', authorUserId: 'alice', body: 'Third',
    });

    const comments = await getComments('event', 'e-order');
    expect(comments.map((c) => c.id)).toEqual([id1, id2, id3]);
    expect(comments.map((c) => c.body)).toEqual(['First', 'Second', 'Third']);
  });

  it('getComments scopes to entityKind + entityId only', async () => {
    useDbAs('alice');
    const inScope = await addComment({
      entityKind: 'event', entityId: 'e-scope', municipalityId: 'm1', authorUserId: 'alice', body: 'In scope',
    });
    await addComment({
      entityKind: 'event', entityId: 'e-other', municipalityId: 'm1', authorUserId: 'alice', body: 'Different entityId',
    });
    await addComment({
      entityKind: 'place', entityId: 'e-scope', municipalityId: 'm1', authorUserId: 'alice', body: 'Different entityKind',
    });

    const comments = await getComments('event', 'e-scope');
    expect(comments.map((c) => c.id)).toEqual([inScope]);
  });

  it('deleteComment removes the comment from subsequent getComments', async () => {
    useDbAs('alice');
    const id = await addComment({
      entityKind: 'event', entityId: 'e-delete', municipalityId: 'm1', authorUserId: 'alice', body: 'Temporary',
    });
    expect(await getComments('event', 'e-delete')).toHaveLength(1);

    await deleteComment(id);
    expect(await getComments('event', 'e-delete')).toHaveLength(0);
  });
});

describe('commentsService — real trigger round-trip (event parent)', () => {
  it('addComment/deleteComment bumps and un-bumps events/{id}.commentCount via syncEntityCommentCount', async () => {
    const eventId = await seedEvent('m-trigger');
    expect((await readEventCounters('m-trigger', eventId)).commentCount).toBe(0);

    useDbAs('alice');
    await addComment({
      entityKind: 'event', entityId: eventId, municipalityId: 'm-trigger', authorUserId: 'alice', body: 'Nos vemos allí',
    });
    const afterAdd = await pollUntil(
      () => readEventCounters('m-trigger', eventId),
      (v) => v.commentCount === 1,
    );
    expect(afterAdd.commentCount).toBe(1);

    const [comment] = await getComments('event', eventId);
    await deleteComment(comment.id);
    const afterDelete = await pollUntil(
      () => readEventCounters('m-trigger', eventId),
      (v) => v.commentCount === 0,
    );
    expect(afterDelete.commentCount).toBe(0);
  }, 2 * TRIGGER_POLL_MS + 10_000);
});

describe('commentsService — real trigger round-trip (nested place parent)', () => {
  it('addComment bumps municipalities/{m}/places/{id}.commentCount via syncEntityCommentCount', async () => {
    const municipalityId = 'm-trigger-place';
    const placeId = await seedPlace(municipalityId);
    expect(await readPlaceCommentCount(municipalityId, placeId)).toBe(0);

    useDbAs('alice');
    await addComment({
      entityKind: 'place', entityId: placeId, municipalityId, authorUserId: 'alice', body: 'Qué bonita ermita',
    });
    const count = await pollUntil(
      () => readPlaceCommentCount(municipalityId, placeId),
      (v) => v === 1,
    );
    expect(count).toBe(1);
  }, TRIGGER_POLL_MS + 10_000);
});
