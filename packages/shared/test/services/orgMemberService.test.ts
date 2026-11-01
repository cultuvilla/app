/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-assignment */
// vi.mock factories legitimately fake the firebase/firestore SDK shape;
// the rule family doesn't add value for these inline mocks.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  organizationMembersCollection: vi.fn((_db, orgId) => ({ _orgId: orgId })),
  organizationMemberDoc: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { httpsCallable } from 'firebase/functions';
import {
  setOrgMemberRole,
  getOrgAdminIds,
} from '../../src/services/orgMemberService';

describe('orgMemberService roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setOrgMemberRole invokes the changeOrgMemberRole callable', async () => {
    const call = vi.fn().mockResolvedValue({ data: { ok: true } });
    vi.mocked(httpsCallable).mockReturnValue(call as unknown as ReturnType<typeof httpsCallable>);
    await setOrgMemberRole('org1', 'u1', 'admin');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'changeOrgMemberRole');
    expect(call).toHaveBeenCalledWith({ orgId: 'org1', targetUserId: 'u1', role: 'admin' });
  });
});

describe('getOrgAdminIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ids of members with admin role', async () => {
    const { getDocs } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'u1', data: () => ({ joinedAt: new Date(), role: 'admin' }) },
        { id: 'u2', data: () => ({ joinedAt: new Date(), role: 'member' }) },
        { id: 'u3', data: () => ({ joinedAt: new Date(), role: 'admin' }) },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const adminIds = await getOrgAdminIds('org1');
    expect(adminIds).toEqual(['u1', 'u3']);
  });
});

describe('isOrgAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the membership doc has role admin', async () => {
    const { getDoc } = await import('firebase/firestore');
    const { isOrgAdmin } = await import('../../src/services/orgMemberService');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ joinedAt: new Date(), role: 'admin' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(await isOrgAdmin('org1', 'u1')).toBe(true);
  });

  it('returns false when the member has role member', async () => {
    const { getDoc } = await import('firebase/firestore');
    const { isOrgAdmin } = await import('../../src/services/orgMemberService');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ joinedAt: new Date(), role: 'member' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(await isOrgAdmin('org1', 'u1')).toBe(false);
  });

  it('returns false when no membership doc exists', async () => {
    const { getDoc } = await import('firebase/firestore');
    const { isOrgAdmin } = await import('../../src/services/orgMemberService');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
      data: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(await isOrgAdmin('org1', 'u1')).toBe(false);
  });
});
