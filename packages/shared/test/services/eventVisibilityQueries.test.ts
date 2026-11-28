/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-extraneous-class,
                  @typescript-eslint/require-await */
// The contract under test is narrow but load-bearing: rules do not filter a
// list, so a query that forgets to pin `visibility` either leaks private events
// or fails outright. These assertions are on the CONSTRAINTS, not the results.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { fakeQuerySnapshot } from '../helpers/sdkFakes';

const EMPTY = fakeQuerySnapshot();

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

describe('the feed cuts off at the start of the Madrid day', () => {
  // 00:30 on 16 June in Madrid; still 15 June on a phone in Mexico City.
  const NOW = new Date('2026-06-15T22:30:00Z');
  const MADRID_MIDNIGHT = new Date('2026-06-15T22:00:00Z');
  let prevTz: string | undefined;

  beforeEach(() => {
    prevTz = process.env.TZ;
    process.env.TZ = 'America/Mexico_City';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = prevTz;
  });

  const cutoff = () => {
    const call = vi.mocked(where).mock.calls.find(([field, op]) => field === 'endBoundary' && op === '>=');
    return (call?.[2] as { _d: Date } | undefined)?._d.toISOString();
  };

  it('the public feed', async () => {
    await getUpcomingFeed(10);
    expect(cutoff()).toBe(MADRID_MIDNIGHT.toISOString());
  });

  it('the private feed', async () => {
    await getPrivateUpcomingFeed(['org1']);
    expect(cutoff()).toBe(MADRID_MIDNIGHT.toISOString());
  });
});
