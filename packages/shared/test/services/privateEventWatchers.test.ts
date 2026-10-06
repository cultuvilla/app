// The private-event watchers merge one listener per org. Rules refuse an open
// org's private-events query outright, and a refused part used to blank the
// whole merge — on the home feed and on the village home alike. These pin that
// both watchers wrap their parts so a refusal answers empty.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = { next: (snap: unknown) => void; error: (err: unknown) => void };
const listeners = vi.hoisted(() => [] as Listener[]);

vi.mock('../../src/firebase', () => ({ getDb: vi.fn() }));
vi.mock('../../src/firebase/refs/client', () => ({
  eventsCollection: vi.fn(() => ({})),
  eventDoc: vi.fn(() => ({})),
}));
vi.mock('../../src/firebase/sdk/firestore', () => ({
  onSnapshot: (_q: unknown, next: Listener['next'], error: Listener['error']) => {
    listeners.push({ next, error });
    return () => undefined;
  },
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  Timestamp: { fromDate: (d: Date) => d },
}));

import { watchPrivateUpcomingFeed } from '../../src/services/feedService';
import { watchPrivateEventsByMunicipality } from '../../src/services/eventService';

const refused = Object.assign(new Error('denied'), { code: 'firestore/permission-denied' });

function snapshot(rows: Record<string, unknown>[]) {
  return { docs: rows.map((r) => ({ id: r.id as string, data: () => r })) };
}

beforeEach(() => {
  listeners.length = 0;
});

describe('watchPrivateUpcomingFeed', () => {
  it("still emits the peña's events when the rules refuse an open org's query", () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    watchPrivateUpcomingFeed(['open-org', 'pena'], onNext, onError);

    listeners[0].error(refused);
    listeners[1].next(snapshot([{ id: 'cena', endBoundary: new Date('2030-01-01') }]));

    expect(onError).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'cena' })]);
  });

  it('emits an empty feed, not a hang, when every org is refused', () => {
    const onNext = vi.fn();
    watchPrivateUpcomingFeed(['a', 'b'], onNext, vi.fn());

    listeners[0].error(refused);
    listeners[1].error(refused);

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledWith([]);
  });
});

describe('watchPrivateEventsByMunicipality', () => {
  it("still emits the peña's events when the rules refuse an open org's query", () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    watchPrivateEventsByMunicipality('village', ['open-org', 'pena'], undefined, onNext, onError);

    listeners[0].error(refused);
    listeners[1].next(
      snapshot([{ id: 'cena', municipalityId: 'village', startDate: new Date('2030-01-01') }]),
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'cena' })]);
  });
});
