// The hourly sweep that flips published events to `completed` once their last
// day is over — in Madrid time, not UTC. `now` is pinned with a Date-only fake
// clock so the day boundary can be tested exactly (timers stay real, so the
// emulator's gRPC traffic is unaffected).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as admin from 'firebase-admin';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { completeExpiredEvents } from '../../events/eventCompletion';

const run = () => completeExpiredEvents.run({ scheduleTime: new Date().toISOString() });
const db = () => admin.firestore();

// 2026-06-16 00:30 in Madrid (CEST, UTC+2) — but still 2026-06-15 in UTC.
const NOW = new Date('2026-06-15T22:30:00Z');

type Status = 'published' | 'completed' | 'cancelled';

async function seedEvent(
  id: string,
  startDate: Date,
  opts: { endDate?: Date | null; status?: Status } = {},
) {
  const endDate = opts.endDate ?? null;
  const created = new Date('2026-01-01T00:00:00Z');
  await db().doc(`events/${id}`).set({
    title: `Evento ${id}`,
    description: '',
    startDate,
    endDate,
    location: { coordinates: new admin.firestore.GeoPoint(40.4, -3.7), displayName: 'plaza' },
    imageURL: null,
    maxAttendees: null,
    telephoneRequired: false,
    requiresPayment: false,
    signupFields: [],
    status: opts.status ?? 'published',
    organizerUserIds: ['organizer'],
    organizerOrgIds: [],
    createdBy: 'organizer',
    createdAt: created,
    updatedAt: created,
    municipalityId: 'mun',
    villageName: 'Matabuena',
    villageSlug: 'matabuena',
    villageCoverImage: null,
    villageCoordinates: null,
    confirmedCount: 0,
    totalCount: 0,
    endBoundary: endDate ?? startDate,
    commentCount: 0,
    readCount: 0,
  });
}

async function statusOf(id: string): Promise<unknown> {
  return (await db().doc(`events/${id}`).get()).get('status');
}

beforeEach(async () => {
  await resetEmulators();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('completeExpiredEvents', () => {
  it('completes a published single-day event whose Madrid day is over', async () => {
    await seedEvent('yesterday', new Date('2026-06-14T18:00:00Z'));
    await run();

    const snap = await db().doc('events/yesterday').get();
    expect(snap.get('status')).toBe('completed');
    // updatedAt is bumped by the sweep, not left at the seed value.
    expect(snap.get('updatedAt').toDate().getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00Z').getTime(),
    );
  });

  it('keys the day boundary off Madrid, not UTC', async () => {
    // 23:30 Madrid on the 15th: same UTC day as NOW, but a past Madrid day.
    await seedEvent('late-last-night', new Date('2026-06-15T21:30:00Z'));
    // 00:10 Madrid on the 16th: already started, but today in Madrid.
    await seedEvent('just-after-midnight', new Date('2026-06-15T22:10:00Z'));
    await run();

    expect(await statusOf('late-last-night')).toBe('completed');
    expect(await statusOf('just-after-midnight')).toBe('published');
  });

  it('leaves future events published', async () => {
    await seedEvent('tomorrow', new Date('2026-06-17T10:00:00Z'));
    await run();
    expect(await statusOf('tomorrow')).toBe('published');
  });

  it('keeps a multi-day event live until its endDate’s Madrid day is over', async () => {
    await seedEvent('fiestas-ongoing', new Date('2026-06-10T10:00:00Z'), {
      endDate: new Date('2026-06-16T20:00:00Z'),
    });
    await seedEvent('fiestas-over', new Date('2026-06-10T10:00:00Z'), {
      endDate: new Date('2026-06-15T20:00:00Z'),
    });
    await run();

    expect(await statusOf('fiestas-ongoing')).toBe('published');
    expect(await statusOf('fiestas-over')).toBe('completed');
  });

  it('only touches published events', async () => {
    const past = new Date('2026-06-01T10:00:00Z');
    const seededAt = new Date('2026-01-01T00:00:00Z').getTime();
    await seedEvent('cancelled', past, { status: 'cancelled' });
    await seedEvent('done', past, { status: 'completed' });
    await run();

    expect(await statusOf('cancelled')).toBe('cancelled');
    const done = await db().doc('events/done').get();
    expect(done.get('status')).toBe('completed');
    // Already-completed events are not rewritten.
    expect(done.get('updatedAt').toDate().getTime()).toBe(seededAt);
  });
});
