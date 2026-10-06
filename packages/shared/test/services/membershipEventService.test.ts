import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => {
  const m = createFakeFirestoreModule();
  return { ...m, query: vi.fn(m.query) };
});

import { query } from 'firebase/firestore';
import { getMembershipEvents } from '../../src/services/membershipEventService';

function event(municipalityId: string, at: Date) {
  return {
    scopeType: 'village',
    scopeId: municipalityId,
    municipalityId,
    actorUserId: 'admin',
    targetUserId: 'member',
    action: 'role_changed',
    fromRole: 'user',
    toRole: 'admin',
    at,
  };
}

describe('getMembershipEvents', () => {
  beforeEach(() => {
    resetFakeFirestore();
    vi.mocked(query).mockClear();
  });

  it('returns only the village’s events, each carrying its doc id', async () => {
    fakeStore()['membershipEvents/e1'] = event('m1', new Date('2026-01-01'));
    fakeStore()['membershipEvents/e2'] = event('m2', new Date('2026-01-02'));

    const events = await getMembershipEvents('m1');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'e1', municipalityId: 'm1', action: 'role_changed' });
  });

  it('scopes by municipalityId and orders newest first (the indexed shape)', async () => {
    await getMembershipEvents('m1');

    const [, ...constraints] = vi.mocked(query).mock.calls[0] as unknown[];
    expect(constraints).toEqual([
      { _type: 'where', field: 'municipalityId', op: '==', value: 'm1' },
      { _type: 'orderBy', field: 'at', dir: 'desc' },
    ]);
  });
});
