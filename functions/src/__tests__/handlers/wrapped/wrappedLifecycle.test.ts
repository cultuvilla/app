// The Wrapped lifecycle against the emulators: an admin creates a year's
// Wrapped from the dates they pick, the scheduler reminds admins to do so the
// month after the last fiestas, and a draft nobody answered publishes itself
// once its grace period runs out.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { madridDayKey, madridMonth, madridYear } from '@cultuvilla/shared/models';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { runVillageWrappedLifecycle } from '../../../wrapped/wrappedScheduler';
import { respondToVillageWrapped } from '../../../wrapped/respondToVillageWrapped';
import { buildVillageWrapped } from '../../../wrapped/buildVillageWrapped';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MID = 'mun-wrapped';
const ADMIN = 'ana';
const MEMBER = 'luis';
const NOW = new Date();
const YEAR = madridYear(NOW);
const TODAY = madridDayKey(NOW);
const WRAPPED_ID = `${MID}_${String(YEAR)}`;
const BLOCK = { id: 'carmen', name: 'Carmen', month: madridMonth(NOW) };

const db = () => admin.firestore();

async function seedVillage(fiestas: unknown[]): Promise<void> {
  await db().doc(`municipalities/${MID}`).set({
    name: 'Matabuena', nameLower: 'matabuena', nameAliases: [], localityNames: [], searchPrefixes: ['m'],
    slug: 'matabuena', province: 'Segovia', comunidadAutonoma: 'Castilla y León', codigoINE: '40118',
    coordinates: null, locationLabel: null, mapZoom: null, createdAt: new Date(),
    escudoUrl: null, escudoThumbUrl: null, escudoManualUrl: null,
    communityActive: true,
    community: { description: 'Un pueblo', organizerId: ADMIN, organizerSex: null, profileForm: null, activatedAt: new Date(), fiestas },
  });
  for (const [uid, role] of [[ADMIN, 'admin'], [MEMBER, 'user']] as const) {
    await db().doc(`municipalities/${MID}/members/${uid}`).set({
      userId: uid, role, joinedAt: new Date(), profileAnswers: {}, profileCompletedAt: null,
    });
  }
}

/** Events that start today, inside a request whose block and range are today. */
async function seedEvents(count: number, confirmed: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const id = `ev-${String(i)}`;
    await db().doc(`events/${id}`).set({
      municipalityId: MID, villageSlug: 'matabuena', title: `Evento ${String(i)}`, status: 'published',
      startDate: admin.firestore.Timestamp.fromDate(NOW),
      commentCount: 0, createdBy: ADMIN, organizerOrgIds: [], imageURL: null,
      visibility: 'public', visibilityOrgId: null,
    });
    if (i < confirmed) {
      await db().doc(`events/${id}/registrations/r-${String(i)}`)
        .set({ personId: `p-${String(i)}`, userId: MEMBER, status: 'confirmed' });
    }
  }
}

function todayRequest(overrides: Record<string, unknown> = {}) {
  return {
    municipalityId: MID,
    year: YEAR,
    blocks: [{ blockId: BLOCK.id, startDay: TODAY, endDay: TODAY }],
    range: { startDay: TODAY, endDay: TODAY },
    ...overrides,
  };
}

async function build(uid: string | null, data: unknown = todayRequest()): Promise<unknown> {
  const wrapped = ft.wrap(buildVillageWrapped);
  return wrapped({ data, auth: uid ? { uid, token: {} } : undefined } as unknown as Parameters<typeof wrapped>[0]);
}

/**
 * A scheduled function has no payload, so it is invoked through its own `run`
 * rather than `ft.wrap` — firebase-functions-test only wraps event handlers.
 */
async function runScheduler(): Promise<void> {
  await runVillageWrappedLifecycle.run({
    scheduleTime: new Date().toISOString(),
    jobName: 'test',
  } as Parameters<typeof runVillageWrappedLifecycle.run>[0]);
}

async function respond(uid: string | null, decision: string): Promise<unknown> {
  const wrapped = ft.wrap(respondToVillageWrapped);
  return wrapped({
    data: { wrappedId: WRAPPED_ID, decision },
    auth: uid ? { uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0]);
}

const wrappedData = async () => (await db().doc(`villageWrapped/${WRAPPED_ID}`).get()).data();

/** The "your pueblo's Wrapped is out" notification each member holds, by uid. */
async function publishedNotices(): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const uid of [ADMIN, MEMBER]) {
    const snap = await db().doc(`users/${uid}/notifications/wrapped_published_${WRAPPED_ID}`).get();
    out[uid] = snap.exists ? (snap.get('type') as string) : undefined;
  }
  return out;
}

describe('village Wrapped lifecycle', () => {
  beforeEach(async () => {
    await resetEmulators();
  });
  afterAll(() => {
    ft.cleanup();
  });

  describe('buildVillageWrapped', () => {
    it('builds a draft from the picked dates and renders its cards', async () => {
      await seedVillage([BLOCK]);
      await seedEvents(4, 3);

      await expect(build(ADMIN)).resolves.toEqual({ wrappedId: WRAPPED_ID, status: 'draft' });

      const data = await wrappedData();
      expect(data?.stats.eventCount).toBe(4);
      expect(data?.blocks).toHaveLength(1);
      expect(data?.blocks[0]).toMatchObject({ blockId: 'carmen', name: 'Carmen' });
      expect(data?.rangeStart).toBeDefined();
      // Every card with something to show rendered and got a forwardable URL.
      expect(Object.keys(data?.images ?? {}).sort()).toEqual(
        ['cover', 'events', 'organizers', 'people', 'posters', 'stats'],
      );
      expect(data?.images.cover).toContain('token=');
      // A Wrapped that cleared the floor carries the timer that will release it.
      expect(data?.autoPublishAt).not.toBeNull();
    }, 180_000);

    it('refuses an ordinary member and an anonymous caller', async () => {
      await seedVillage([BLOCK]);
      await expect(build(MEMBER)).rejects.toThrow(/autorizado/);
      await expect(build(null)).rejects.toThrow(/sesión/);
      expect((await db().collection('villageWrapped').get()).empty).toBe(true);
    }, 60_000);

    it('refuses dates that fail the request rules, naming the problem', async () => {
      await seedVillage([BLOCK]);
      await expect(build(ADMIN, todayRequest({ blocks: [{ blockId: 'san-roque', startDay: TODAY, endDay: TODAY }] })))
        .rejects.toThrow(/ya no está/);
      await expect(build(ADMIN, { municipalityId: MID, year: 'este' })).rejects.toThrow(/inválidos/);
      expect((await db().collection('villageWrapped').get()).empty).toBe(true);
    }, 60_000);

    // A thin Wrapped on the pueblo's own noticeboard reads as "nothing happened
    // here". It is still built — an admin may decide it is worth showing.
    it('never puts a thin Wrapped on the auto-publish timer', async () => {
      await seedVillage([BLOCK]);
      await seedEvents(1, 0);

      await build(ADMIN);

      const data = await wrappedData();
      expect(data?.status).toBe('draft');
      expect(data?.autoPublishAt).toBeNull();
    }, 120_000);

    it('keeps a published Wrapped published when it is regenerated', async () => {
      await seedVillage([BLOCK]);
      await seedEvents(4, 3);
      await build(ADMIN);
      await respond(ADMIN, 'publish');

      await expect(build(ADMIN)).resolves.toEqual({ wrappedId: WRAPPED_ID, status: 'published' });
      expect((await wrappedData())?.autoPublishAt).toBeNull();
    }, 240_000);

    it('brings a discarded Wrapped back as a draft when the admin asks again', async () => {
      await seedVillage([BLOCK]);
      await seedEvents(4, 3);
      await build(ADMIN);
      await respond(ADMIN, 'discard');

      await expect(build(ADMIN)).resolves.toEqual({ wrappedId: WRAPPED_ID, status: 'draft' });
    }, 240_000);
  });

  describe('reminder', () => {
    // The fiestas month just ended: last month in Madrid (December in January).
    const lastMonth = madridMonth(NOW) === 1 ? 12 : madridMonth(NOW) - 1;
    const reminderYear = madridMonth(NOW) === 1 ? YEAR - 1 : YEAR;
    const pastBlock = { id: 'carmen', name: 'Carmen', month: lastMonth };

    it('asks the admins, and only the admins, once', async () => {
      await seedVillage([pastBlock]);

      await runScheduler();
      await runScheduler();

      const adminInbox = await db().collection(`users/${ADMIN}/notifications`).get();
      expect(adminInbox.docs.map((d) => [d.id, d.get('type')])).toEqual([
        [`wrapped_reminder_${MID}_${String(reminderYear)}`, 'village_wrapped_reminder'],
      ]);
      expect(adminInbox.docs[0].get('municipalityId')).toBe(MID);
      // The year it is about, so a January reminder for December's fiestas
      // opens last year's Wrapped rather than this year's.
      expect(adminInbox.docs[0].get('entityId')).toBe(`${MID}_${String(reminderYear)}`);
      expect((await db().collection(`users/${MEMBER}/notifications`).get()).empty).toBe(true);
    }, 60_000);

    it('does not remind while the fiestas month is still running', async () => {
      await seedVillage([BLOCK]);
      await runScheduler();
      expect((await db().collection(`users/${ADMIN}/notifications`).get()).empty).toBe(true);
    }, 60_000);

    it('does not remind a village that already created the Wrapped', async () => {
      await seedVillage([pastBlock]);
      await db().doc(`villageWrapped/${MID}_${String(reminderYear)}`).set({ municipalityId: MID, status: 'draft' });
      await runScheduler();
      expect((await db().collection(`users/${ADMIN}/notifications`).get()).empty).toBe(true);
    }, 60_000);
  });

  it('publishes a draft whose grace period ran out', async () => {
    await seedVillage([BLOCK]);
    await seedEvents(4, 3);
    await build(ADMIN);
    await db().doc(`villageWrapped/${WRAPPED_ID}`)
      .update({ autoPublishAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000)) });

    await runScheduler();

    const data = await wrappedData();
    expect(data?.status).toBe('published');
    expect(data?.autoPublishAt).toBeNull();
    expect(await publishedNotices()).toEqual({
      [ADMIN]: 'village_wrapped_published',
      [MEMBER]: 'village_wrapped_published',
    });
  }, 180_000);

  describe('respondToVillageWrapped', () => {
    beforeEach(async () => {
      await seedVillage([BLOCK]);
      await seedEvents(4, 3);
      await build(ADMIN);
    }, 180_000);

    it('lets a village admin publish', async () => {
      await expect(respond(ADMIN, 'publish')).resolves.toEqual({ status: 'published' });
      const data = await wrappedData();
      expect(data?.status).toBe('published');
      expect(data?.autoPublishAt).toBeNull();
    }, 120_000);

    it('tells every member once it is published', async () => {
      await respond(ADMIN, 'publish');

      expect(await publishedNotices()).toEqual({
        [ADMIN]: 'village_wrapped_published',
        [MEMBER]: 'village_wrapped_published',
      });
      const notice = await db().doc(`users/${MEMBER}/notifications/wrapped_published_${WRAPPED_ID}`).get();
      expect(notice.get('entityId')).toBe(WRAPPED_ID);
      expect(notice.get('municipalityId')).toBe(MID);
    }, 120_000);

    it('tells nobody about a discarded Wrapped', async () => {
      await respond(ADMIN, 'discard');
      expect(await publishedNotices()).toEqual({ [ADMIN]: undefined, [MEMBER]: undefined });
    }, 120_000);

    it('refuses an ordinary member', async () => {
      await expect(respond(MEMBER, 'publish')).rejects.toThrow(/autorizado/);
    }, 120_000);

    it('refuses an anonymous caller', async () => {
      await expect(respond(null, 'publish')).rejects.toThrow(/sesión/);
    }, 120_000);

    it('refuses a second decision on the same Wrapped', async () => {
      await respond(ADMIN, 'publish');
      await expect(respond(ADMIN, 'discard')).rejects.toThrow(/resuelto/);
    }, 120_000);
  });
});
