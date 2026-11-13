// Trigger tests for the "something new in your village" broadcast, driven via
// firebase-functions-test against the Firestore emulator.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import {
  onBarrioPublished,
  onEventPublished,
  onFestivalPosterPublished,
  onHistoryEntryPublished,
  onNewsPublished,
  onPlacePublished,
} from '../../../village/entityPublishedTriggers';
import { onOrganizationUpdated } from '../../../organizations/notificationTriggers';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUN = 'mun-broadcast';
const ACTOR = 'actor-1';
const MEMBERS = [ACTOR, 'member-1', 'member-2'];

async function seedVillage(): Promise<void> {
  const db = admin.firestore();
  await db.doc(`municipalities/${MUN}`).set({ name: 'Matabuena' });
  for (const uid of MEMBERS) {
    await db.doc(`municipalities/${MUN}/members/${uid}`).set({ role: 'user' });
  }
}

async function notificationsOf(uid: string) {
  return (await admin.firestore().collection(`users/${uid}/notifications`).get()).docs;
}

async function fireCreate(
  fn: Parameters<typeof ft.wrap>[0],
  path: string,
  data: Record<string, unknown>,
  params: Record<string, string>,
): Promise<void> {
  const wrapped = ft.wrap(fn);
  await wrapped({
    data: ft.firestore.makeDocumentSnapshot(data, path),
    params,
  } as unknown as Parameters<typeof wrapped>[0]);
}

beforeEach(async () => {
  await resetEmulators();
  await seedVillage();
});

afterAll(() => {
  ft.cleanup();
});

describe('village entity broadcast', () => {
  describe('a new event', () => {
    const event = { municipalityId: MUN, createdBy: ACTOR, title: 'Paella', status: 'published', organizerOrgIds: ['org-1'] };

    it("reaches the village's members, and nobody else", async () => {
      await fireCreate(onEventPublished, 'events/e1', event, { eventId: 'e1' });

      const [n, ...rest] = await notificationsOf('member-1');
      expect(rest).toHaveLength(0);
      expect(n.id).toBe('village_entity_event_e1');
      expect(await notificationsOf('member-2')).toHaveLength(1);
      expect(await notificationsOf('visitor')).toHaveLength(0);
    });

    it('announces a private event to nobody', async () => {
      await fireCreate(
        onEventPublished,
        'events/e2',
        { ...event, visibility: 'organization', visibilityOrgId: 'org-1' },
        { eventId: 'e2' },
      );

      for (const uid of ['visitor', 'member-1', 'member-2']) {
        expect(await notificationsOf(uid)).toHaveLength(0);
      }
    });
  });

  it('tells every member except the author about a new post', async () => {
    await fireCreate(
      onNewsPublished,
      'news/p1',
      { municipalityId: MUN, createdBy: ACTOR, title: 'Fiestas de agosto', status: 'active' },
      { newsId: 'p1' },
    );

    expect(await notificationsOf(ACTOR)).toHaveLength(0);
    for (const uid of ['member-1', 'member-2']) {
      const [n, ...rest] = await notificationsOf(uid);
      expect(rest).toHaveLength(0);
      expect(n.id).toBe('village_entity_news_p1');
      expect(n.data()).toMatchObject({
        type: 'village_entity_published',
        entityKind: 'news',
        entityId: 'p1',
        municipalityId: MUN,
        title: 'Nueva publicación en Matabuena',
        body: '«Fiestas de agosto»',
        read: false,
      });
    }
  });

  it('writes one row per member even when the trigger is redelivered', async () => {
    const data = { municipalityId: MUN, createdBy: ACTOR, title: 'X', status: 'active' };
    await fireCreate(onNewsPublished, 'news/p1', data, { newsId: 'p1' });
    await fireCreate(onNewsPublished, 'news/p1', data, { newsId: 'p1' });
    expect(await notificationsOf('member-1')).toHaveLength(1);
  });

  it('stays silent about hidden content', async () => {
    await fireCreate(
      onNewsPublished,
      'news/p2',
      { municipalityId: MUN, createdBy: ACTOR, title: 'X', status: 'hidden' },
      { newsId: 'p2' },
    );
    expect(await notificationsOf('member-1')).toHaveLength(0);
  });

  it('announces only published events', async () => {
    await fireCreate(
      onEventPublished,
      'events/e1',
      { municipalityId: MUN, createdBy: ACTOR, title: 'Verbena', status: 'cancelled' },
      { eventId: 'e1' },
    );
    expect(await notificationsOf('member-1')).toHaveLength(0);

    await fireCreate(
      onEventPublished,
      'events/e2',
      { municipalityId: MUN, createdBy: ACTOR, title: 'Verbena', status: 'published' },
      { eventId: 'e2' },
    );
    const [n] = await notificationsOf('member-1');
    expect(n.data()).toMatchObject({ entityKind: 'event', entityId: 'e2', title: 'Nuevo evento en Matabuena' });
  });

  it('announces a weekly series once, on its first occurrence', async () => {
    const series = (index: number) => ({ id: 's1', index, weekdays: [2, 4], until: new Date('2026-12-01') });
    for (const index of [0, 1, 2]) {
      await fireCreate(
        onEventPublished,
        `events/s1-${String(index)}`,
        { municipalityId: MUN, createdBy: ACTOR, title: 'Yoga', status: 'published', series: series(index) },
        { eventId: `s1-${String(index)}` },
      );
    }
    const notes = await notificationsOf('member-1');
    expect(notes.map((d) => d.id)).toEqual(['village_entity_event_s1-0']);
  });

  it('announces a place proposed by a person', async () => {
    await fireCreate(
      onPlacePublished,
      `municipalities/${MUN}/places/pl1`,
      { municipalityId: MUN, name: 'Ermita', proposedBy: ACTOR, status: 'active' },
      { municipalityId: MUN, placeId: 'pl1' },
    );
    const [n] = await notificationsOf('member-2');
    expect(n.data()).toMatchObject({ entityKind: 'place', entityId: 'pl1', body: '«Ermita»' });
  });

  it('does not announce barrios imported from the dataset', async () => {
    await fireCreate(
      onBarrioPublished,
      `municipalities/${MUN}/barrios/b1`,
      { municipalityId: MUN, name: 'Ibarra', source: 'osm', proposedBy: null, status: 'active' },
      { municipalityId: MUN, barrioId: 'b1' },
    );
    expect(await notificationsOf('member-1')).toHaveLength(0);

    await fireCreate(
      onBarrioPublished,
      `municipalities/${MUN}/barrios/b2`,
      { municipalityId: MUN, name: 'El Arrabal', source: 'user', proposedBy: ACTOR, status: 'active' },
      { municipalityId: MUN, barrioId: 'b2' },
    );
    expect(await notificationsOf('member-1')).toHaveLength(1);
  });

  it('falls back to a sentence for an untitled poster', async () => {
    await fireCreate(
      onFestivalPosterPublished,
      'festivalPosters/fp1',
      { municipalityId: MUN, title: null, proposedBy: ACTOR, status: 'active' },
      { posterId: 'fp1' },
    );
    const [n] = await notificationsOf('member-1');
    expect(n.data()['body']).toBe('Un cartel de fiestas nuevo en tu pueblo.');
  });

  it('announces a new history entry on the village timeline', async () => {
    await fireCreate(
      onHistoryEntryPublished,
      'historyEntries/h1',
      { municipalityId: MUN, createdBy: ACTOR, title: 'La riada del 62', status: 'active' },
      { entryId: 'h1' },
    );
    const [n] = await notificationsOf('member-1');
    expect(n.id).toBe('village_entity_historyEntry_h1');
    expect(n.data()).toMatchObject({
      entityKind: 'historyEntry',
      title: 'Nueva entrada de historia en Matabuena',
      body: '«La riada del 62»',
    });
    expect(await notificationsOf(ACTOR)).toHaveLength(0);
  });

  it('announces an organization on approval, not on creation, and spares the founder', async () => {
    const wrapped = ft.wrap(onOrganizationUpdated);
    const base = { name: 'Peña El Recreo', municipalityId: MUN, requestedBy: ACTOR };
    await wrapped({
      data: ft.makeChange(
        ft.firestore.makeDocumentSnapshot({ ...base, status: 'pending' }, 'organizations/o1'),
        ft.firestore.makeDocumentSnapshot({ ...base, status: 'approved' }, 'organizations/o1'),
      ),
      params: { orgId: 'o1' },
    } as unknown as Parameters<typeof wrapped>[0]);

    // The founder gets exactly their own outcome, not the broadcast.
    const founder = await notificationsOf(ACTOR);
    expect(founder.map((d) => d.data()['type'])).toEqual(['org_approved']);

    const [n] = await notificationsOf('member-1');
    expect(n.id).toBe('village_entity_organization_o1');
    expect(n.data()).toMatchObject({ entityKind: 'organization', title: 'Nueva organización en Matabuena' });
  });

  it('does not broadcast a rejection', async () => {
    const wrapped = ft.wrap(onOrganizationUpdated);
    const base = { name: 'Peña', municipalityId: MUN, requestedBy: ACTOR };
    await wrapped({
      data: ft.makeChange(
        ft.firestore.makeDocumentSnapshot({ ...base, status: 'pending' }, 'organizations/o2'),
        ft.firestore.makeDocumentSnapshot({ ...base, status: 'rejected' }, 'organizations/o2'),
      ),
      params: { orgId: 'o2' },
    } as unknown as Parameters<typeof wrapped>[0]);
    expect(await notificationsOf('member-1')).toHaveLength(0);
  });
});
