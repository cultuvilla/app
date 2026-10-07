/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-explicit-any,
                  @typescript-eslint/no-extraneous-class,
                  @typescript-eslint/require-await */
// The contract under test is narrow but load-bearing: rules do not filter a
// list, so a query that forgets to pin `visibility` either leaks private events
// or fails outright. These assertions are on the CONSTRAINTS, not the results.
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
    limit: vi.fn((n) => ({ _limit: n })),
    startAfter: vi.fn((c) => ({ _startAfter: c })),
    where: vi.fn((field, op, value) => ({ _where: field, _op: op, _value: value })),
    getCountFromServer: vi.fn(),
  };
});

import { getDocs, where } from 'firebase/firestore';
import {
  getEventsByMunicipality,
  getPrivateEventsByMunicipality,
} from '../../src/services/eventService';
import { getPrivateUpcomingFeed, getUpcomingFeed } from '../../src/services/feedService';

const EMPTY = { docs: [] } as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocs).mockResolvedValue(EMPTY);
});

describe('public queries pin visibility', () => {
  it('the global feed asks only for public events', async () => {
    await getUpcomingFeed(10);
    expect(where).toHaveBeenCalledWith('visibility', '==', 'public');
  });

  it('the village list asks only for public events', async () => {
    await getEventsByMunicipality('m1', ['published', 'completed']);
    expect(where).toHaveBeenCalledWith('visibility', '==', 'public');
  });

});

describe('private queries stay one org at a time', () => {
  it('issues one query per org rather than an `in` over all of them', async () => {
    await getPrivateEventsByMunicipality('m1', ['org1', 'org2'], 'published');
    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(where).toHaveBeenCalledWith('visibilityOrgId', '==', 'org1');
    expect(where).toHaveBeenCalledWith('visibilityOrgId', '==', 'org2');
    expect(where).not.toHaveBeenCalledWith('visibilityOrgId', 'in', expect.anything());
  });

  it('does not query at all for a viewer with no orgs', async () => {
    expect(await getPrivateEventsByMunicipality('m1', [], 'published')).toEqual([]);
    expect(await getPrivateUpcomingFeed([])).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('the private feed pins the org and the published status', async () => {
    await getPrivateUpcomingFeed(['org1']);
    expect(where).toHaveBeenCalledWith('visibilityOrgId', '==', 'org1');
    expect(where).toHaveBeenCalledWith('status', '==', 'published');
  });
});
