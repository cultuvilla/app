import { describe, it, expect, vi } from 'vitest';
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

vi.mock('../../src/services/cosatecaService', () => ({
  getMyPendingCosaRequests: vi.fn().mockResolvedValue([
    { id: 'r-1', cosaTitle: 'Taladro', status: 'pending', createdAt: new Date('2026-10-01') },
  ]),
}));

import { getMyPendingRequests } from '../../src/services/inboxService';

describe('getMyPendingRequests', () => {
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
});
