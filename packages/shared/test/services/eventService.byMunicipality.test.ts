/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-assignment,
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
    getCountFromServer: vi.fn(),
  };
});

import { getDocs, where, orderBy } from 'firebase/firestore';
import { getEventsByMunicipality } from '../../src/services/eventService';
import { fakeQuerySnapshot } from '../helpers/sdkFakes';

describe('getEventsByMunicipality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDocs).mockResolvedValue(fakeQuerySnapshot([]));
  });

  it('scopes to the municipality and orders by startDate asc with no status filter', async () => {
    await getEventsByMunicipality('mun-1');

    expect(where).toHaveBeenCalledWith('municipalityId', '==', 'mun-1');
    expect(orderBy).toHaveBeenCalledWith('startDate', 'asc');
    // No status constraint when none is asked for.
    expect(where).not.toHaveBeenCalledWith('status', '==', expect.anything());
    expect(where).not.toHaveBeenCalledWith('status', 'in', expect.anything());
  });

  it('filters by equality for a single status', async () => {
    await getEventsByMunicipality('mun-1', 'published');

    expect(where).toHaveBeenCalledWith('municipalityId', '==', 'mun-1');
    expect(where).toHaveBeenCalledWith('status', '==', 'published');
    expect(orderBy).toHaveBeenCalledWith('startDate', 'asc');
  });

  it('filters by an in-set for a status array (published + completed for the pueblo tab)', async () => {
    await getEventsByMunicipality('mun-1', ['published', 'completed']);

    expect(where).toHaveBeenCalledWith('municipalityId', '==', 'mun-1');
    expect(where).toHaveBeenCalledWith('status', 'in', ['published', 'completed']);
    // An in-set query must never also emit an equality status filter.
    expect(where).not.toHaveBeenCalledWith('status', '==', expect.anything());
    expect(orderBy).toHaveBeenCalledWith('startDate', 'asc');
  });

  it('maps returned docs to include their id', async () => {
    vi.mocked(getDocs).mockResolvedValue(fakeQuerySnapshot([
        { id: 'e-1', data: () => ({ status: 'published', title: 'A' }) },
        { id: 'e-2', data: () => ({ status: 'completed', title: 'B' }) },
      ]));

    const events = await getEventsByMunicipality('mun-1', ['published', 'completed']);

    expect(events.map((e) => e.id)).toEqual(['e-1', 'e-2']);
  });
});
