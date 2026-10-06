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
import { where } from '../../src/firebase/sdk/firestore';
import {
  watchEventsByOrganization,
  watchPrivateEventsByMunicipality,
} from '../../src/services/eventService';

const refused = Object.assign(new Error('denied'), { code: 'firestore/permission-denied' });

function snapshot(rows: Record<string, unknown>[]) {
  return { docs: rows.map((r) => ({ id: r.id as string, data: () => r })) };
}

beforeEach(() => {
  listeners.length = 0;
  vi.mocked(where).mockClear();
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

describe('watchEventsByOrganization', () => {
  const at = (iso: string) => new Date(iso);

  it('asks a non-member only for public events, with no private query', () => {
    const onNext = vi.fn();
    watchEventsByOrganization('org', { includePrivate: false }, onNext, vi.fn());

    expect(listeners).toHaveLength(1);
    expect(where).toHaveBeenCalledWith('organizerOrgIds', 'array-contains', 'org');
    expect(where).toHaveBeenCalledWith('visibility', '==', 'public');
    expect(where).not.toHaveBeenCalledWith('visibilityOrgId', '==', 'org');
  });

  it('merges a vetted member\'s private events, keeps only the org\'s own, drops cancelled and sorts by start', () => {
    const onNext = vi.fn();
    watchEventsByOrganization('org', { includePrivate: true }, onNext, vi.fn());

    expect(listeners).toHaveLength(2);
    expect(where).toHaveBeenCalledWith('visibilityOrgId', '==', 'org');
    listeners[0].next(
      snapshot([
        { id: 'fiesta', status: 'published', startDate: at('2030-08-01'), organizerOrgIds: ['org'] },
        { id: 'suspendida', status: 'cancelled', startDate: at('2030-01-01'), organizerOrgIds: ['org'] },
      ]),
    );
    listeners[1].next(
      snapshot([
        { id: 'cena', status: 'completed', startDate: at('2029-12-01'), organizerOrgIds: ['org'] },
        // Restricted to this org's members, but organized by someone else.
        { id: 'ajena', status: 'published', startDate: at('2030-02-01'), organizerOrgIds: ['otra'] },
      ]),
    );

    expect(onNext).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'cena' }),
      expect.objectContaining({ id: 'fiesta' }),
    ]);
  });

  it('keeps the public events when the rules refuse the private half', () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    watchEventsByOrganization('org', { includePrivate: true }, onNext, onError);

    listeners[0].next(
      snapshot([{ id: 'fiesta', status: 'published', startDate: at('2030-08-01'), organizerOrgIds: ['org'] }]),
    );
    listeners[1].error(refused);

    expect(onError).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'fiesta' })]);
  });
});
