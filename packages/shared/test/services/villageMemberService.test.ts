/* eslint-disable @typescript-eslint/no-explicit-any,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/require-await */
// joinVillage is an atomic writeBatch: create the member doc AND upsert the
// residence link on the caller's person, in one commit (no eventual-consistency
// window). This asserts both writes land, the member doc carries NO barrioId
// (single source of truth is the person), and the residence link is the exact
// { municipalityId, barrioId } shape via buildResidenceLinks.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted: mock factories are hoisted above top-level declarations, so shared
// mock state must be created here to be referenceable inside the factories.
const h = vi.hoisted(() => {
  const state: { person: unknown } = { person: null };
  return {
    setActiveMunicipality: vi.fn(async () => undefined),
    ops: [] as { op: 'set' | 'update'; id: string; data: any }[],
    state,
  };
});

vi.mock('../../src/firebase', () => ({ getDb: () => ({}) }));
vi.mock('../../src/services/userService', () => ({
  setActiveMunicipality: h.setActiveMunicipality,
}));
vi.mock('../../src/services/personService', () => ({
  getPersonByUserId: async () => h.state.person,
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

import { joinVillage } from '../../src/services/villageMemberService';

beforeEach(() => {
  h.ops.length = 0;
  h.state.person = null;
  h.setActiveMunicipality.mockClear();
});

describe('joinVillage', () => {
  it('batches member-create + residence-link upsert; member carries no barrioId', async () => {
    h.state.person = { id: 'p1', municipalityLinks: [{ municipalityId: 'm2', barrioId: 'y' }] };

    await joinVillage('m1', 'alice', 'centro');

    const memberOp = h.ops.find((o) => o.id === 'municipalities/m1/members/alice');
    const personOp = h.ops.find((o) => o.id === 'persons/p1');
    expect(memberOp?.op).toBe('set');
    expect(memberOp?.data).not.toHaveProperty('barrioId');
    expect(memberOp?.data.userId).toBe('alice');
    expect(memberOp?.data.role).toBe('user');

    expect(personOp?.op).toBe('update');
    expect(personOp?.data.municipalityLinks).toEqual([
      { municipalityId: 'm2', barrioId: 'y' },
      { municipalityId: 'm1', barrioId: 'centro' },
    ]);

    expect(h.setActiveMunicipality).toHaveBeenCalledWith('alice', 'm1');
  });

  it('joins whole-village (null barrio) by default', async () => {
    h.state.person = { id: 'p1', municipalityLinks: [] };

    await joinVillage('m1', 'alice');

    const personOp = h.ops.find((o) => o.id === 'persons/p1');
    expect(personOp?.data.municipalityLinks).toEqual([{ municipalityId: 'm1', barrioId: null }]);
  });

  it('still creates the membership when the caller has no person doc', async () => {
    h.state.person = null;

    await joinVillage('m1', 'alice', 'centro');

    expect(h.ops.map((o) => o.id)).toEqual(['municipalities/m1/members/alice']);
    expect(h.setActiveMunicipality).toHaveBeenCalledWith('alice', 'm1');
  });
});
