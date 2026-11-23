import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { PendingSentRequest } from '../../src/services/inboxService';

vi.mock('../../src/services/organizerRequestService', () => ({
  getMyOrganizerRequests: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/services/organizationService', () => ({
  getMyOrganizations: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/services/orgJoinRequestService', () => ({
  getMyPendingOrgJoinRequests: vi.fn().mockResolvedValue([
    { userId: 'u-1', orgId: 'org-1', municipalityId: 'm-1', createdAt: new Date('2026-09-30') },
  ]),
}));

const getMyPendingCosaRequests = vi.fn();
vi.mock('../../src/services/cosatecaService', () => ({
  getMyPendingCosaRequests: (...a: unknown[]) => getMyPendingCosaRequests(...a) as unknown,
}));
const captureError = vi.fn();
vi.mock('../../src/services/observability/observabilityService', () => ({
  observability: { captureError: (...a: unknown[]) => captureError(...a) as unknown },
}));

import { getMyPendingRequests } from '../../src/services/inboxService';

describe('getMyPendingRequests', () => {
  beforeEach(() => {
    captureError.mockReset();
    getMyPendingCosaRequests.mockResolvedValue([
      { id: 'r-1', cosaTitle: 'Taladro', status: 'pending', createdAt: new Date('2026-10-01') },
    ]);
  });

  it('lists a pending org join request, labelled with the org id, and a cosa asked for, by its title', async () => {
    const pending: PendingSentRequest[] = await getMyPendingRequests('u-1');
    expect(pending).toEqual([
      {
        requestType: 'orgJoin',
        id: 'org-1_u-1',
        label: 'org-1',
        createdAt: new Date('2026-09-30'),
      },
      { requestType: 'cosa', id: 'r-1', label: 'Taladro', createdAt: new Date('2026-10-01') },
    ]);
  });

  it('reports an unreadable cosa request list and keeps the rest of the Buzón', async () => {
    const failure = new Error('permission-denied');
    getMyPendingCosaRequests.mockRejectedValue(failure);
    const pending = await getMyPendingRequests('u-1');
    expect(pending.map((p) => p.requestType)).toEqual(['orgJoin']);
    expect(captureError).toHaveBeenCalledWith(failure, { operation: 'inbox:getMyPendingCosaRequests' });
  });
});
