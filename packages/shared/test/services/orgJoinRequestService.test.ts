/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-explicit-any,
                  @typescript-eslint/require-await */
// vi.mock factories legitimately fake the firebase SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(), getFirebaseFunctions: vi.fn() }));
const callableFn = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callableFn) }));
vi.mock('firebase/firestore', async () => {
  const makeRef = (...args: unknown[]) => {
    const ref: { _path: unknown[]; withConverter: ReturnType<typeof vi.fn> } = {
      _path: args,
      withConverter: vi.fn(),
    };
    ref.withConverter.mockReturnValue(ref);
    return ref;
  };
  return {
    collection: vi.fn((...a) => makeRef(...a)),
    collectionGroup: vi.fn((...a) => makeRef(...a)),
    doc: vi.fn((...a) => makeRef(...a)),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn((...args: unknown[]) => ({ args })),
    where: vi.fn((...a) => ({ where: a })),
    Timestamp: { fromDate: (d: Date) => ({ toDate: () => d }) },
  };
});

import { collectionGroup, getDocs, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  getMyPendingOrgJoinRequests,
  requestToJoinOrganization,
  respondToOrgJoinRequest,
} from '../../src/services/orgJoinRequestService';

beforeEach(() => vi.clearAllMocks());

describe('orgJoinRequestService', () => {
  it('files the request at organizations/{org}/joinRequests/{uid} with the rule-checked shape', async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);

    await requestToJoinOrganization('org-1', 'm-1', 'u-1');

    const [ref, payload] = vi.mocked(setDoc).mock.calls[0] as [{ _path: unknown[] }, object];
    expect(ref._path.slice(1)).toEqual(['organizations', 'org-1', 'joinRequests', 'u-1']);
    expect(Object.keys(payload).sort()).toEqual(['createdAt', 'municipalityId', 'orgId', 'userId']);
    expect(payload).toMatchObject({ userId: 'u-1', orgId: 'org-1', municipalityId: 'm-1' });
  });

  it("lists the requester's own requests with a userId-filtered collection-group query", async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);

    await getMyPendingOrgJoinRequests('u-1');

    expect(vi.mocked(collectionGroup).mock.calls[0]?.[1]).toBe('joinRequests');
    expect(where).toHaveBeenCalledWith('userId', '==', 'u-1');
  });

  it('resolves a request through the respondToOrgJoinRequest callable', async () => {
    callableFn.mockResolvedValue({ data: { ok: true } });

    await respondToOrgJoinRequest('org-1', 'u-1', 'approved');

    expect(vi.mocked(httpsCallable).mock.calls[0]?.[1]).toBe('respondToOrgJoinRequest');
    expect(callableFn).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'u-1', decision: 'approved' });
  });
});
