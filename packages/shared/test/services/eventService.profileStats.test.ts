/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-explicit-any,
                  @typescript-eslint/no-extraneous-class,
                  @typescript-eslint/require-await */
// vi.mock factories legitimately fake the firebase/firestore SDK shape;
// the rule family doesn't add value for these inline mocks.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn() }));
vi.mock('firebase/firestore', async () => {
  const makeRef = (..._args: unknown[]) => {
    const ref = { _path: _args, withConverter: vi.fn() };
    ref.withConverter.mockReturnValue(ref);
    return ref;
  };
  return {
    collection: vi.fn((..._args) => makeRef(..._args)),
    doc: vi.fn((..._args) => makeRef(..._args)),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    serverTimestamp: () => '__SERVER_TIMESTAMP__',
    Timestamp: { fromDate: (d: Date) => ({ toDate: () => d, _d: d }) },
    GeoPoint: class {},
    query: vi.fn((_col, ...constraints) => ({ _constraints: constraints })),
    orderBy: vi.fn((field, dir) => ({ _orderBy: field, _dir: dir })),
    where: vi.fn((field, op, value) => ({ _where: field, _op: op, _value: value })),
    onSnapshot: vi.fn(),
  };
});

import { getDocs, onSnapshot, where, orderBy } from 'firebase/firestore';
import {
  getEventsByOrganizer,
  watchEventsByOrganizer,
} from '../../src/services/eventService';

describe('getEventsByOrganizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries organizerUserIds array-contains ordered by createdAt desc', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);

    await getEventsByOrganizer('uid-1');

    expect(where).toHaveBeenCalledWith('organizerUserIds', 'array-contains', 'uid-1');
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  // Regression: "deleting" an event soft-cancels it (status -> 'cancelled'), but the
  // profile's managed-events list kept showing it. Cancelled events must not appear.
  it('omits cancelled (soft-deleted) events from the organizer list', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'e-published', data: () => ({ status: 'published' }) },
        { id: 'e-cancelled', data: () => ({ status: 'cancelled' }) },
        { id: 'e-completed', data: () => ({ status: 'completed' }) },
      ],
    } as any);

    const events = await getEventsByOrganizer('uid-1');

    expect(events.map((e) => e.id)).toEqual(['e-published', 'e-completed']);
  });
});

// The profile's managed-events scroll reads through this watcher: same query,
// same soft-delete filter as getEventsByOrganizer.
describe('watchEventsByOrganizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('watches the organizer query and drops cancelled events', () => {
    vi.mocked(onSnapshot).mockImplementation(((_q: unknown, next: (snap: unknown) => void) => {
      next({
        docs: [
          { id: 'e-published', data: () => ({ status: 'published' }) },
          { id: 'e-cancelled', data: () => ({ status: 'cancelled' }) },
        ],
      });
      return () => undefined;
    }) as any);
    let ids: string[] = [];

    watchEventsByOrganizer('uid-1', (events) => (ids = events.map((e) => e.id)), vi.fn());

    expect(where).toHaveBeenCalledWith('organizerUserIds', 'array-contains', 'uid-1');
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(ids).toEqual(['e-published']);
  });
});
