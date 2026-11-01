/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-explicit-any,
                  @typescript-eslint/require-await */
// vi.mock factories legitimately fake the firebase SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(), getFirebaseFunctions: vi.fn() }));
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
    setDoc: vi.fn(),
    deleteDoc: vi.fn(),
    Timestamp: { fromDate: (d: Date) => ({ toDate: () => d }) },
  };
});

import { deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import {
  followOrganization,
  isFollowingOrganization,
  unfollowOrganization,
} from '../../src/services/orgFollowerService';

const pathOf = (ref: unknown): unknown[] => (ref as { _path: unknown[] })._path.slice(1);

describe('orgFollowerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('follows at the user\'s own doc under the org', async () => {
    await followOrganization('org1', 'mun1', 'u1');
    const [ref, data] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, unknown];
    expect(pathOf(ref)).toEqual(['organizations', 'org1', 'followers', 'u1']);
    expect(data).toMatchObject({ userId: 'u1', orgId: 'org1', municipalityId: 'mun1' });
  });

  it('unfollows by deleting that doc', async () => {
    await unfollowOrganization('org1', 'u1');
    expect(pathOf(vi.mocked(deleteDoc).mock.calls[0]?.[0])).toEqual(['organizations', 'org1', 'followers', 'u1']);
  });

  it('reads whether the user follows', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true } as any);
    await expect(isFollowingOrganization('org1', 'u1')).resolves.toBe(true);
  });
});
