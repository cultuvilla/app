import { beforeEach, describe, it, expect, vi } from 'vitest';

const getPendingOrganizerRequests = vi.fn();
vi.mock('../../src/services/organizerRequestService', () => ({
  getMyOrganizerRequests: vi.fn(),
  getPendingOrganizerRequests: () => getPendingOrganizerRequests() as unknown,
}));
const getPendingOrganizations = vi.fn();
const getOrganizationsByMunicipality = vi.fn();
vi.mock('../../src/services/organizationService', () => ({
  getMyOrganizations: vi.fn(),
  getPendingOrganizations: () => getPendingOrganizations() as unknown,
  getOrganizationsByMunicipality: (...a: unknown[]) => getOrganizationsByMunicipality(...a) as unknown,
}));
const getPendingOrgJoinRequests = vi.fn();
vi.mock('../../src/services/orgJoinRequestService', () => ({
  getMyPendingOrgJoinRequests: vi.fn(),
  getPendingOrgJoinRequests: (...a: unknown[]) => getPendingOrgJoinRequests(...a) as unknown,
}));
const getOpenReports = vi.fn();
const getReportsByMunicipality = vi.fn();
vi.mock('../../src/services/contentReportService', () => ({
  getOpenReports: () => getOpenReports() as unknown,
  getReportsByMunicipality: (...a: unknown[]) => getReportsByMunicipality(...a) as unknown,
}));
vi.mock('../../src/services/cosatecaService', () => ({ getMyPendingCosaRequests: vi.fn() }));
vi.mock('../../src/services/observability/observabilityService', () => ({
  observability: { captureError: vi.fn() },
}));

import { actionableScope, getActionableRequests } from '../../src/services/inboxService';

const NONE = { isSuperAdmin: false, adminVillageIds: [], adminOrgIds: [] };

describe('actionableScope', () => {
  it('gives a super admin organizer requests and every village', () => {
    expect(actionableScope({ ...NONE, isSuperAdmin: true })).toEqual({
      organizer: true,
      orgs: 'all',
      joins: [],
      reports: 'all',
    });
  });

  it('gives a village admin org creation and reports for their villages only', () => {
    expect(actionableScope({ ...NONE, adminVillageIds: ['m1', 'm2'] })).toEqual({
      organizer: false,
      orgs: ['m1', 'm2'],
      joins: [],
      reports: ['m1', 'm2'],
    });
  });

  it('gives an org admin the join requests of their orgs and nothing else', () => {
    expect(actionableScope({ ...NONE, adminOrgIds: ['o1'] })).toEqual({
      organizer: false,
      orgs: [],
      joins: ['o1'],
      reports: [],
    });
  });

  it('lets super admin reach win over listed villages, and keeps the orgs', () => {
    expect(
      actionableScope({ isSuperAdmin: true, adminVillageIds: ['m1'], adminOrgIds: ['o1'] }),
    ).toEqual({ organizer: true, orgs: 'all', joins: ['o1'], reports: 'all' });
  });

  it('gives someone who administers nothing an empty scope', () => {
    expect(actionableScope(NONE)).toEqual({ organizer: false, orgs: [], joins: [], reports: [] });
  });
});

describe('getActionableRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPendingOrganizerRequests.mockResolvedValue([{ id: 'req1' }]);
    getPendingOrganizations.mockResolvedValue([{ id: 'orgAll' }]);
    getOrganizationsByMunicipality.mockImplementation((vid: string) => Promise.resolve([{ id: `org-${vid}` }]));
    getPendingOrgJoinRequests.mockImplementation((oid: string) => Promise.resolve([{ orgId: oid, userId: 'u9' }]));
    getOpenReports.mockResolvedValue([{ id: 'rAll' }]);
    getReportsByMunicipality.mockImplementation((vid: string) => Promise.resolve([{ id: `r-${vid}` }]));
  });

  it('reads every queue a super admin resolves, app-wide', async () => {
    const result = await getActionableRequests(
      actionableScope({ isSuperAdmin: true, adminVillageIds: [], adminOrgIds: ['o1'] }),
    );
    expect(result).toEqual({
      organizer: [{ id: 'req1' }],
      orgs: [{ id: 'orgAll' }],
      joins: [{ orgId: 'o1', userId: 'u9' }],
      reports: [{ id: 'rAll' }],
    });
    expect(getOrganizationsByMunicipality).not.toHaveBeenCalled();
    expect(getReportsByMunicipality).not.toHaveBeenCalled();
  });

  it("reads a village admin's queues per village", async () => {
    const result = await getActionableRequests(actionableScope({ ...NONE, adminVillageIds: ['m1', 'm2'] }));
    expect(result.organizer).toEqual([]);
    expect(result.orgs).toEqual([{ id: 'org-m1' }, { id: 'org-m2' }]);
    expect(result.reports).toEqual([{ id: 'r-m1' }, { id: 'r-m2' }]);
    expect(getOrganizationsByMunicipality).toHaveBeenCalledWith('m1', 'pending');
    expect(getReportsByMunicipality).toHaveBeenCalledWith('m2', { status: 'open' });
    expect(getPendingOrganizerRequests).not.toHaveBeenCalled();
    expect(getPendingOrganizations).not.toHaveBeenCalled();
    expect(getOpenReports).not.toHaveBeenCalled();
  });

  it('reads nothing for an empty scope', async () => {
    const result = await getActionableRequests(actionableScope(NONE));
    expect(result).toEqual({ organizer: [], orgs: [], joins: [], reports: [] });
    for (const fn of [
      getPendingOrganizerRequests,
      getPendingOrganizations,
      getOrganizationsByMunicipality,
      getPendingOrgJoinRequests,
      getOpenReports,
      getReportsByMunicipality,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('reads only the kinds asked for', async () => {
    const result = await getActionableRequests(
      actionableScope({ isSuperAdmin: true, adminVillageIds: [], adminOrgIds: ['o1'] }),
      ['organizer', 'orgs'],
    );
    expect(result.joins).toEqual([]);
    expect(result.reports).toEqual([]);
    expect(getPendingOrgJoinRequests).not.toHaveBeenCalled();
    expect(getOpenReports).not.toHaveBeenCalled();
  });

  it("keeps the other orgs' join requests when one org's read fails", async () => {
    getPendingOrgJoinRequests.mockImplementation((oid: string) =>
      oid === 'o1'
        ? Promise.reject(new Error('permission-denied'))
        : Promise.resolve([{ orgId: oid, userId: 'u9' }]),
    );
    const result = await getActionableRequests(actionableScope({ ...NONE, adminOrgIds: ['o1', 'o2'] }));
    expect(result.joins).toEqual([{ orgId: 'o2', userId: 'u9' }]);
  });

  it("keeps the other villages' reports when one village's read fails", async () => {
    getReportsByMunicipality.mockImplementation((vid: string) =>
      vid === 'm1' ? Promise.reject(new Error('permission-denied')) : Promise.resolve([{ id: `r-${vid}` }]),
    );
    const result = await getActionableRequests(
      actionableScope({ ...NONE, adminVillageIds: ['m1', 'm2'] }),
      ['reports'],
    );
    expect(result.reports).toEqual([{ id: 'r-m2' }]);
  });

  it("fails the call when a village's org-creation read fails", async () => {
    getOrganizationsByMunicipality.mockRejectedValue(new Error('unavailable'));
    await expect(
      getActionableRequests(actionableScope({ ...NONE, adminVillageIds: ['m1'] })),
    ).rejects.toThrow('unavailable');
  });

  it('fails the call when the organizer read fails', async () => {
    getPendingOrganizerRequests.mockRejectedValue(new Error('unavailable'));
    await expect(
      getActionableRequests(actionableScope({ ...NONE, isSuperAdmin: true })),
    ).rejects.toThrow('unavailable');
  });

  it('fails the call when the app-wide reports read fails', async () => {
    getOpenReports.mockRejectedValue(new Error('unavailable'));
    await expect(
      getActionableRequests(actionableScope({ ...NONE, isSuperAdmin: true }), ['reports']),
    ).rejects.toThrow('unavailable');
  });
});
