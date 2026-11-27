import { describe, it, expect, vi, beforeEach } from 'vitest';

const { commitMock, deleteMock, updateMock } = vi.hoisted(() => ({
  commitMock: vi.fn().mockResolvedValue(undefined),
  deleteMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  writeBatch: () => ({ delete: deleteMock, update: updateMock, commit: commitMock }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  collectionGroup: vi.fn(),
  where: vi.fn(),
  query: vi.fn(),
}));
vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: () => ({}) }));
vi.mock('../../src/firebase/refs/client', () => ({
  municipalityMembersCollection: vi.fn(),
  municipalityMemberDoc: (_db: unknown, m: string, u: string) => ({ path: `municipalities/${m}/members/${u}` }),
}));
vi.mock('../../src/firebase/converters/villageMemberConverter.client', () => ({ villageMemberConverterClient: {} }));
vi.mock('../../src/services/userService', () => ({ setActiveMunicipality: vi.fn() }));
vi.mock('../../src/services/municipalityService', () => ({ getMunicipality: vi.fn(), startVillage: vi.fn() }));

const getPersonByUserId = vi.fn<(userId: string) => Promise<unknown>>();
vi.mock('../../src/services/personService', () => ({ getPersonByUserId: (userId: string) => getPersonByUserId(userId) }));

import { leaveVillage } from '../../src/services/villageMemberService';

describe('leaveVillage', () => {
  beforeEach(() => {
    commitMock.mockClear();
    deleteMock.mockClear();
    updateMock.mockClear();
    getPersonByUserId.mockReset();
  });

  it('deletes the member doc and strips the residence link in one batch', async () => {
    getPersonByUserId.mockResolvedValue({
      id: 'p1',
      municipalityLinks: [
        { municipalityId: 'm1', barrioId: 'b1' },
        { municipalityId: 'm2', barrioId: null },
      ],
    });

    await leaveVillage('m1', 'u1');

    expect(deleteMock).toHaveBeenCalledWith({ path: 'municipalities/m1/members/u1' });
    expect(updateMock).toHaveBeenCalledWith(
      { path: 'persons/p1' },
      { municipalityLinks: [{ municipalityId: 'm2', barrioId: null }] },
    );
    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it('deletes only the member doc when the caller has no person', async () => {
    getPersonByUserId.mockResolvedValue(null);
    await leaveVillage('m1', 'u1');
    expect(deleteMock).toHaveBeenCalledWith({ path: 'municipalities/m1/members/u1' });
    expect(updateMock).not.toHaveBeenCalled();
    expect(commitMock).toHaveBeenCalledTimes(1);
  });
});
