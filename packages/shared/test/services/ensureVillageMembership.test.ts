/* eslint-disable @typescript-eslint/no-explicit-any,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/require-await */
// ensureVillageMembership is the single entry point registration / "sign in to
// join" use to land the caller in a village. For an already-active village it is
// a plain self-service join; for a DORMANT municipality it activates the
// community via startVillage (which itself seats the caller as the first member,
// role 'user') so a members/{uid} doc always ends up existing — that doc is what
// the profile's village list reads.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state: { person: unknown; municipality: unknown } = { person: null, municipality: null };
  return {
    setActiveMunicipality: vi.fn(async () => undefined),
    startVillage: vi.fn(async () => undefined),
    ops: [] as { op: 'set' | 'update'; id: string; data: any }[],
    state,
  };
});

vi.mock('../../src/firebase', () => ({
  getDb: () => ({}),
  getFirebaseFunctions: () => ({}),
}));
vi.mock('../../src/services/userService', () => ({
  setActiveMunicipality: h.setActiveMunicipality,
}));
vi.mock('../../src/services/personService', () => ({
  getPersonByUserId: async () => h.state.person,
}));
vi.mock('../../src/services/municipalityService', () => ({
  getMunicipality: async () => h.state.municipality,
  startVillage: h.startVillage,
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => {
    const ref: any = { _id: p.join('/') };
    ref.withConverter = () => ref;
    return ref;
  },
  collection: (_db: unknown, ...p: string[]) => {
    const ref: any = { _id: p.join('/') };
    ref.withConverter = () => ref;
    return ref;
  },
  collectionGroup: () => ({ withConverter: () => ({}) }),
  query: () => ({}),
  where: () => ({}),
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({ docs: [] }),
  deleteDoc: async () => undefined,
  writeBatch: () => ({
    set: (ref: any, data: any) => h.ops.push({ op: 'set', id: ref._id, data }),
    update: (ref: any, data: any) => h.ops.push({ op: 'update', id: ref._id, data }),
    commit: async () => undefined,
  }),
}));

import { ensureVillageMembership } from '../../src/services/villageMemberService';

beforeEach(() => {
  h.ops.length = 0;
  h.state.person = null;
  h.state.municipality = null;
  h.setActiveMunicipality.mockClear();
  h.startVillage.mockClear();
});

describe('ensureVillageMembership', () => {
  it('joins directly when the community is already active', async () => {
    h.state.municipality = { communityActive: true };
    h.state.person = { id: 'p1', municipalityLinks: [] };

    await ensureVillageMembership('m1', 'alice', 'centro');

    // Plain self-service join: a members/{uid} doc is written directly, and the
    // village becomes active — no activation callable.
    const memberOp = h.ops.find((o) => o.id === 'municipalities/m1/members/alice');
    expect(memberOp?.op).toBe('set');
    expect(memberOp?.data.role).toBe('user');
    expect(h.setActiveMunicipality).toHaveBeenCalledWith('alice', 'm1');
    expect(h.startVillage).not.toHaveBeenCalled();
  });

  it('activates a dormant municipality via startVillage (which seats the member)', async () => {
    h.state.municipality = { communityActive: false };

    await ensureVillageMembership('m1', 'alice', 'centro');

    // No direct member write — startVillage owns member creation server-side.
    expect(h.ops.find((o) => o.id === 'municipalities/m1/members/alice')).toBeUndefined();
    expect(h.startVillage).toHaveBeenCalledWith({ municipalityId: 'm1' });
    // Activation leaves activeMunicipalityId unset, so we set it here.
    expect(h.setActiveMunicipality).toHaveBeenCalledWith('alice', 'm1');
  });

  it('treats a missing municipality as dormant (activate rather than fail a join)', async () => {
    h.state.municipality = null;

    await ensureVillageMembership('m1', 'alice');

    expect(h.startVillage).toHaveBeenCalledWith({ municipalityId: 'm1' });
    expect(h.ops.find((o) => o.id === 'municipalities/m1/members/alice')).toBeUndefined();
  });
});
