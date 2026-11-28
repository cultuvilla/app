// A group present in pueblos besides its own: the request a group admin files,
// the queue a pueblo's Equipo reads, and the two callables that move the
// group's `municipalityIds` (docs/decisions/multi-village-groups.md).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFirestoreModule, fakeStore, resetFakeFirestore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => createFakeFirestoreModule());
const callableFn = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callableFn) }));

import { httpsCallable } from 'firebase/functions';
import {
  cancelOrgPresenceRequest,
  getMyPendingOrgPresenceRequests,
  getPendingOrgPresenceRequests,
  removeOrgPresence,
  requestOrgPresence,
  respondToOrgPresenceRequest,
  watchOrgPresenceRequests,
} from '../../src/services/orgPresenceService';
import type { OrgPresenceRequestData } from '../../src/models/organization/OrgPresenceRequestDataModel';

const request = (orgId: string, municipalityId: string, at: number, requestedBy = 'admin'): OrgPresenceRequestData => ({
  orgId,
  municipalityId,
  homeMunicipalityId: 'home',
  orgName: `Grupo ${orgId}`,
  requestedBy,
  createdAt: new Date(at),
});

beforeEach(() => {
  resetFakeFirestore();
  vi.clearAllMocks();
});

describe('requestOrgPresence', () => {
  it('files the request under the group, keyed by the pueblo asked, with the rule-checked shape', async () => {
    await requestOrgPresence({
      orgId: 'o1',
      orgName: 'Asociación comarcal',
      homeMunicipalityId: 'home',
      municipalityId: 'm2',
      requestedBy: 'admin',
    });

    const stored = fakeStore()['organizations/o1/presenceRequests/m2'];
    expect(Object.keys(stored).sort()).toEqual([
      'createdAt', 'homeMunicipalityId', 'municipalityId', 'orgId', 'orgName', 'requestedBy',
    ]);
    expect(stored).toMatchObject({ orgId: 'o1', municipalityId: 'm2', homeMunicipalityId: 'home', requestedBy: 'admin' });
  });

  it('is withdrawn by deleting it', async () => {
    fakeStore()['organizations/o1/presenceRequests/m2'] = request('o1', 'm2', 1);
    await cancelOrgPresenceRequest('o1', 'm2');
    expect(fakeStore()['organizations/o1/presenceRequests/m2']).toBeUndefined();
  });
});

describe('reading the requests', () => {
  beforeEach(() => {
    const store = fakeStore();
    store['organizations/o1/presenceRequests/m2'] = request('o1', 'm2', 30);
    store['organizations/o2/presenceRequests/m2'] = request('o2', 'm2', 10, 'other');
    store['organizations/o1/presenceRequests/m3'] = request('o1', 'm3', 20);
  });

  it("gives a pueblo's Equipo only the requests to their pueblos, oldest first", async () => {
    const rows = await getPendingOrgPresenceRequests(['m2']);
    expect(rows.map((r) => r.orgId)).toEqual(['o2', 'o1']);
  });

  it('gives an app admin every request', async () => {
    const rows = await getPendingOrgPresenceRequests('all');
    expect(rows.map((r) => `${r.orgId}/${r.municipalityId}`)).toEqual(['o2/m2', 'o1/m3', 'o1/m2']);
  });

  it('gives the admin who asked their own pending requests', async () => {
    const rows = await getMyPendingOrgPresenceRequests('admin');
    expect(rows.map((r) => r.municipalityId).sort()).toEqual(['m2', 'm3']);
  });

  it("watches one group's requests", () => {
    const seen: OrgPresenceRequestData[][] = [];
    watchOrgPresenceRequests('o1', (rows) => seen.push(rows), (error) => {
      throw error;
    });
    expect(seen[0]?.map((r) => r.municipalityId).sort()).toEqual(['m2', 'm3']);
  });
});

describe('the callables', () => {
  it('resolves a request through respondToOrgPresenceRequest', async () => {
    callableFn.mockResolvedValue({ data: { ok: true } });
    await respondToOrgPresenceRequest('o1', 'm2', 'approved');
    expect(vi.mocked(httpsCallable).mock.calls[0]?.[1]).toBe('respondToOrgPresenceRequest');
    expect(callableFn).toHaveBeenCalledWith({ orgId: 'o1', municipalityId: 'm2', decision: 'approved' });
  });

  it('takes a group out of a pueblo through removeOrgPresence', async () => {
    callableFn.mockResolvedValue({ data: { ok: true } });
    await removeOrgPresence('o1', 'm2');
    expect(vi.mocked(httpsCallable).mock.calls[0]?.[1]).toBe('removeOrgPresence');
    expect(callableFn).toHaveBeenCalledWith({ orgId: 'o1', municipalityId: 'm2' });
  });
});
