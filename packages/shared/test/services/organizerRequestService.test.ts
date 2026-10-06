import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

const callable = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { ok: true } })));

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => {
  const m = createFakeFirestoreModule();
  return { ...m, query: vi.fn(m.query) };
});
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }));

import { query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  getMyOrganizerRequests,
  getOrganizerRequest,
  getPendingOrganizerRequests,
  requestOrganizeVillage,
  respondToOrganizerRequest,
} from '../../src/services/organizerRequestService';

function lastConstraints(): unknown[] {
  const calls = vi.mocked(query).mock.calls;
  return (calls[calls.length - 1] as unknown[]).slice(1);
}

describe('organizerRequestService', () => {
  beforeEach(() => {
    resetFakeFirestore();
    vi.mocked(query).mockClear();
    vi.mocked(httpsCallable).mockClear();
    callable.mockClear();
    fakeStore()['organizerRequests/r1'] = { userId: 'u1', municipalityId: 'm1', status: 'pending' };
    fakeStore()['organizerRequests/r2'] = { userId: 'u1', municipalityId: 'm2', status: 'approved' };
    fakeStore()['organizerRequests/r3'] = { userId: 'u2', municipalityId: 'm3', status: 'pending' };
  });

  it('getOrganizerRequest returns the request with its id, or null when missing', async () => {
    await expect(getOrganizerRequest('r1')).resolves.toMatchObject({ id: 'r1', userId: 'u1' });
    await expect(getOrganizerRequest('nope')).resolves.toBeNull();
  });

  it('getPendingOrganizerRequests is the admin queue: pending only, oldest first', async () => {
    const pending = await getPendingOrganizerRequests();
    expect(pending.map((r) => r.id).sort()).toEqual(['r1', 'r3']);
    expect(lastConstraints()).toEqual([
      { _type: 'where', field: 'status', op: '==', value: 'pending' },
      { _type: 'orderBy', field: 'requestedAt', dir: 'asc' },
    ]);
  });

  it('getMyOrganizerRequests returns every request of the user, newest first', async () => {
    const mine = await getMyOrganizerRequests('u1');
    expect(mine.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(lastConstraints()).toEqual([
      { _type: 'where', field: 'userId', op: '==', value: 'u1' },
      { _type: 'orderBy', field: 'requestedAt', dir: 'desc' },
    ]);
  });

  it('requestOrganizeVillage goes through its callable, not a client write', async () => {
    await requestOrganizeVillage({ municipalityId: 'm9', motivation: 'Soy de allí' });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'requestOrganizeVillage');
    expect(callable).toHaveBeenCalledWith({ municipalityId: 'm9', motivation: 'Soy de allí' });
    expect(Object.keys(fakeStore()).filter((k) => k.startsWith('organizerRequests/'))).toHaveLength(3);
  });

  it('respondToOrganizerRequest forwards the decision to its callable', async () => {
    await respondToOrganizerRequest({ requestId: 'r1', decision: 'rejected' });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'respondToOrganizerRequest');
    expect(callable).toHaveBeenCalledWith({ requestId: 'r1', decision: 'rejected' });
  });

  it('surfaces a callable failure to the caller', async () => {
    callable.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'functions/permission-denied' }));
    await expect(respondToOrganizerRequest({ requestId: 'r1', decision: 'approved' })).rejects.toThrow(
      'denied',
    );
  });
});
