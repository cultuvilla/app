// createEventSeries / cancelSeriesFrom against a mocked SDK seam: what gets
// written, in how many batches, and which occurrences "este y los siguientes"
// actually touches.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const batch = vi.hoisted(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() }));
const docs = vi.hoisted(() => ({ rows: [] as { id: string; data: () => Record<string, unknown> }[] }));
let nextId = 0;

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('../../src/services/municipalityService', () => ({ getVillageSlug: vi.fn(() => Promise.resolve('villa')) }));
vi.mock('../../src/firebase/refs/client', () => ({
  eventsCollection: vi.fn(() => ({ kind: 'events' })),
  eventDoc: vi.fn(),
}));
vi.mock('../../src/firebase/sdk/firestore', () => ({
  doc: vi.fn((_parent: unknown, _coll?: string, id?: string) => ({ id: id ?? `new-${String(nextId++)}` })),
  writeBatch: vi.fn(() => batch),
  getDocs: vi.fn(() => Promise.resolve({ docs: docs.rows })),
  query: vi.fn(() => ({})),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
  updateDoc: vi.fn(),
  Timestamp: { fromDate: (d: Date) => d },
}));

import { cancelSeriesFrom, createEventSeries } from '../../src/services/eventService';
import { where } from '../../src/firebase/sdk/firestore';

const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);

const input = {
  title: 'Yoga',
  description: '',
  startDate: at(2026, 10, 20, 18),
  endDate: at(2026, 10, 20, 19),
  location: { coordinates: { lat: 40, lng: -3 }, displayName: 'Plaza' },
  organizerUserIds: ['u'],
  organizerOrgIds: [],
  createdBy: 'u',
  municipalityId: 'm',
  villageName: 'Villa',
  villageCoordinates: null,
};

beforeEach(() => {
  nextId = 0;
  batch.set.mockClear();
  batch.update.mockClear();
  batch.commit.mockClear();
  vi.mocked(where).mockClear();
  docs.rows = [];
});

describe('createEventSeries', () => {
  it('writes every occurrence in one batch, linked by the first id', async () => {
    const ids = await createEventSeries(input, { weekdays: [4, 2], until: at(2026, 10, 29) });

    expect(ids).toEqual(['new-0', 'new-1', 'new-2', 'new-3']);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    const written = batch.set.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(written.map((e) => (e['startDate'] as Date).getDate())).toEqual([20, 22, 27, 29]);
    expect(written.map((e) => (e['series'] as { index: number }).index)).toEqual([0, 1, 2, 3]);
    for (const e of written) {
      expect(e['series']).toMatchObject({ id: 'new-0', weekdays: [2, 4] });
      expect(e['villageSlug']).toBe('villa');
      expect((e['endBoundary'] as Date).getHours()).toBe(19);
    }
  });

  it('refuses a rule with no occurrence instead of writing nothing silently', async () => {
    await expect(createEventSeries(input, { weekdays: [1], until: at(2026, 10, 21) })).rejects.toThrow(
      'event-series-empty',
    );
    expect(batch.commit).not.toHaveBeenCalled();
  });
});

describe('cancelSeriesFrom', () => {
  const series = { id: 's', index: 1, weekdays: [2], until: at(2026, 12, 1) };
  const row = (id: string, startDate: Date, status = 'published') => ({ id, data: () => ({ startDate, status }) });

  it('cancels this occurrence and every later published one, nothing earlier', async () => {
    docs.rows = [
      row('past', at(2026, 10, 13, 18)),
      row('this', at(2026, 10, 20, 18)),
      row('next', at(2026, 10, 27, 18)),
      row('gone', at(2026, 11, 3, 18), 'cancelled'),
    ];
    const n = await cancelSeriesFrom({ id: 'this', series, startDate: at(2026, 10, 20, 18), visibilityOrgId: null });

    expect(n).toBe(2);
    expect(batch.update.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual(['this', 'next']);
    expect(batch.update.mock.calls[0]?.[1]).toMatchObject({ status: 'cancelled' });
  });

  it('pins the query to what the viewer may read', async () => {
    await cancelSeriesFrom({ id: 'this', series, startDate: at(2026, 10, 20), visibilityOrgId: null });
    expect(where).toHaveBeenCalledWith('visibility', '==', 'public');

    vi.mocked(where).mockClear();
    await cancelSeriesFrom({ id: 'this', series, startDate: at(2026, 10, 20), visibilityOrgId: 'pena' });
    expect(where).toHaveBeenCalledWith('visibilityOrgId', '==', 'pena');
  });
});
