import { renderHook, waitFor } from '@testing-library/react-native';
import { useApproverStatus } from '../useApproverStatus';

const mockIsAppAdmin = jest.fn();
const mockGetUserMemberships = jest.fn();
const mockGetOrgMembershipsByUserInMunicipality = jest.fn();
const mockGetOrganizationsByMunicipality = jest.fn();

jest.mock('@cultuvilla/shared/services/adminService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/adminService')>(
    '@cultuvilla/shared/services/adminService',
    () => ({
      isAppAdmin: (uid: string) => mockIsAppAdmin(uid),
    }),
  );
});
jest.mock('@cultuvilla/shared/services/villageMemberService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/villageMemberService')>(
    '@cultuvilla/shared/services/villageMemberService',
    () => ({
      getUserMemberships: (uid: string) => mockGetUserMemberships(uid),
    }),
  );
});
jest.mock('@cultuvilla/shared/services/orgMemberService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/orgMemberService')>(
    '@cultuvilla/shared/services/orgMemberService',
    () => ({
      getOrgMembershipsByUserInMunicipality: (
        uid: string,
        municipalityId: string,
        orgIds: string[],
      ) => mockGetOrgMembershipsByUserInMunicipality(uid, municipalityId, orgIds),
    }),
  );
});
jest.mock('@cultuvilla/shared/services/organizationService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/organizationService')>(
    '@cultuvilla/shared/services/organizationService',
    () => ({
      getOrganizationsByMunicipality: (municipalityId: string, status?: string) =>
        mockGetOrganizationsByMunicipality(municipalityId, status),
    }),
  );
});

const mockUseAuth = jest.fn();
jest.mock('../useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Sensible defaults: regular user, member of mun1, no admin anywhere.
  mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });
  mockIsAppAdmin.mockResolvedValue(false);
  mockGetUserMemberships.mockResolvedValue([
    { municipalityId: 'mun1', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
  ]);
  mockGetOrganizationsByMunicipality.mockResolvedValue([]);
  mockGetOrgMembershipsByUserInMunicipality.mockResolvedValue([]);
});

describe('useApproverStatus', () => {
  it('not logged in: returns all false/empty, not loading', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useApproverStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      loading: false,
      isSuperAdmin: false,
      adminVillageIds: [],
      adminOrgIds: [],
      canApprove: false,
    });
  });

  it('super admin: canApprove true, isSuperAdmin true (even with no memberships)', async () => {
    mockIsAppAdmin.mockResolvedValue(true);
    mockGetUserMemberships.mockResolvedValue([]);
    const { result } = renderHook(() => useApproverStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSuperAdmin).toBe(true);
    expect(result.current.canApprove).toBe(true);
  });

  it('admin in a non-active village: adminVillageIds contains that village, canApprove true', async () => {
    // The regression target: user is admin in 'mun-other', not necessarily their active village.
    mockGetUserMemberships.mockResolvedValue([
      { municipalityId: 'mun-other', role: 'admin', joinedAt: new Date(), profileCompletedAt: null },
    ]);
    const { result } = renderHook(() => useApproverStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.adminVillageIds).toContain('mun-other');
    expect(result.current.canApprove).toBe(true);
  });

  it('org admin: canApprove true via adminOrgIds, adminVillageIds empty', async () => {
    mockGetUserMemberships.mockResolvedValue([
      { municipalityId: 'mun1', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
    ]);
    mockGetOrganizationsByMunicipality.mockResolvedValue([{ id: 'org1' }, { id: 'org2' }]);
    mockGetOrgMembershipsByUserInMunicipality.mockResolvedValue([
      { orgId: 'org1', role: 'admin' },
    ]);
    const { result } = renderHook(() => useApproverStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.adminOrgIds).toEqual(['org1']);
    expect(result.current.canApprove).toBe(true);
    expect(result.current.adminVillageIds).toEqual([]);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('plain member: canApprove false, empty arrays', async () => {
    const { result } = renderHook(() => useApproverStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canApprove).toBe(false);
    expect(result.current.adminVillageIds).toEqual([]);
    expect(result.current.adminOrgIds).toEqual([]);
  });

  it('fetch failure: treats as not-an-approver (fail-closed)', async () => {
    mockIsAppAdmin.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useApproverStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canApprove).toBe(false);
    expect(result.current.adminVillageIds).toEqual([]);
    expect(result.current.adminOrgIds).toEqual([]);
  });
});
