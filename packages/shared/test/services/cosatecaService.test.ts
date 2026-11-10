// vi.mock factories fake the firebase/firestore SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let newId = 0;

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  cosasCollection: vi.fn(() => ({ _coll: 'cosas' })),
  cosaDoc: vi.fn((_db, id: string) => ({ _path: `cosas/${id}` })),
  cosaRequestsCollection: vi.fn(() => ({ _coll: 'cosaRequests' })),
  cosaRequestDoc: vi.fn((_db, id: string) => ({ _path: `cosaRequests/${id}` })),
  cosatecaWriteDoc: vi.fn((_db, coll: string, id: string) => ({ _path: `${coll}/${id}` })),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((coll: { _coll?: string } | undefined, id?: string) => ({ id: id ?? `new-${String(++newId)}`, _path: `${coll?._coll ?? ''}/${id ?? 'new'}` })),
  deleteDoc: vi.fn(),
  orderBy: vi.fn((f: string, d: string) => ({ _order: `${f} ${d}` })),
  query: vi.fn((...parts: unknown[]) => ({ _query: parts })),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn((f: string, op: string, v: unknown) => ({ _where: [f, op, v] })),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [{ id: 'r1', data: () => ({ cosaTitle: 'Taladro', status: 'pending' }) }] })),
}));
const callable = vi.fn(() => Promise.resolve({ data: { status: 'accepted' } }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }));

import { getDocs, onSnapshot, setDoc, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  createCosa,
  getMyPendingCosaRequests,
  requestCosa,
  respondToCosaRequest,
  updateCosa,
  watchCosaRequestsToAnswer,
  watchVillageCosas,
} from '../../src/services/cosatecaService';

const pathOf = (ref: unknown) => (ref as { _path: string })._path;

beforeEach(() => {
  vi.clearAllMocks();
  newId = 0;
});

describe('cosatecaService', () => {
  it('createCosa writes a full, available cosa stamped by the server', async () => {
    const id = await createCosa({
      municipalityId: 'm1', orgId: 'o1', audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento',
      kind: 'prestamo', title: ' Llave del gimnasio ', category: 'deporte', description: ' ', createdBy: 'admin1',
    });
    const [ref, data] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(pathOf(ref)).toBe(`cosas/${id}`);
    expect(data).toMatchObject({
      title: 'Llave del gimnasio', description: null, status: 'available', heldBy: null, ownerUid: null,
      createdAt: 'SERVER_TS', updatedAt: 'SERVER_TS',
    });
  });

  it('createCosa refuses a bad shape before writing', async () => {
    await expect(
      createCosa({ municipalityId: 'm1', orgId: 'o1', audience: 'integrantes', ownerUid: 'u1', ownerName: 'Ana', kind: 'prestamo', title: '', category: 'otros', createdBy: 'u1' }),
    ).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('updateCosa edits only what its manager may change', async () => {
    await updateCosa('c1', { kind: 'regalo', title: 'Sofá ', description: null, category: 'otros', imageURL: null, conditions: ' ', status: 'paused' });
    const [ref, data] = vi.mocked(updateDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(pathOf(ref)).toBe('cosas/c1');
    expect(data).toEqual({ kind: 'regalo', title: 'Sofá', description: null, category: 'otros', imageURL: null, conditions: null, status: 'paused', updatedAt: 'SERVER_TS' });
  });

  it('requestCosa writes a pending request', async () => {
    const id = await requestCosa({
      municipalityId: 'm1', orgId: 'o1', cosaId: 'c1', cosaTitle: 'Taladro', cosaKind: 'prestamo', ownerUid: 'u1',
      requesterUid: 'u2', requesterName: 'Luis', fromOn: '2026-07-01', untilOn: '2026-07-03', message: 'Para el sábado',
    });
    const [ref, data] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(pathOf(ref)).toBe(`cosaRequests/${id}`);
    expect(data).toMatchObject({ status: 'pending', respondedAt: null, closedAt: null, createdAt: 'SERVER_TS', message: 'Para el sábado' });
  });

  it('watchVillageCosas asks only for the pueblo cosas of the village', () => {
    watchVillageCosas('m1', vi.fn(), vi.fn());
    expect(where).toHaveBeenCalledWith('municipalityId', '==', 'm1');
    expect(where).toHaveBeenCalledWith('audience', '==', 'pueblo');
  });

  it('respondToCosaRequest goes through the callable', async () => {
    await expect(respondToCosaRequest('r1', 'accept')).resolves.toBe('accepted');
    expect(httpsCallable).toHaveBeenCalledWith({}, 'respondToCosaRequest');
    expect(callable).toHaveBeenCalledWith({ requestId: 'r1', action: 'accept' });
  });

  it('getMyPendingCosaRequests reads my unanswered requests', async () => {
    const rows = await getMyPendingCosaRequests('u2');
    expect(getDocs).toHaveBeenCalled();
    expect(where).toHaveBeenCalledWith('requesterUid', '==', 'u2');
    expect(where).toHaveBeenCalledWith('status', '==', 'pending');
    expect(rows).toEqual([{ id: 'r1', cosaTitle: 'Taladro', status: 'pending' }]);
  });

  it('watchCosaRequestsToAnswer merges my cosas with the groups I run, newest first, once all answer', () => {
    const listeners: ((snap: unknown) => void)[] = [];
    const errors: ((e: unknown) => void)[] = [];
    vi.mocked(onSnapshot).mockImplementation(((_q: unknown, next: (s: unknown) => void, err: (e: unknown) => void) => {
      listeners.push(next);
      errors.push(err);
      return () => undefined;
    }) as never);
    const onNext = vi.fn();
    watchCosaRequestsToAnswer('u1', ['o1', 'o2'], onNext, vi.fn());
    expect(where).toHaveBeenCalledWith('ownerUid', '==', 'u1');
    expect(where).toHaveBeenCalledWith('ownerUid', '==', null);
    expect(listeners).toHaveLength(3);
    const snap = (rows: { id: string; at: number }[]) => ({
      docs: rows.map((r) => ({ id: r.id, data: () => ({ createdAt: new Date(r.at) }) })),
      metadata: { fromCache: false, hasPendingWrites: false },
    });
    listeners[0]?.(snap([{ id: 'a', at: 1 }]));
    listeners[1]?.(snap([{ id: 'b', at: 3 }]));
    expect(onNext).not.toHaveBeenCalled();
    // An org whose admin rights went answers empty instead of failing the merge.
    errors[2]?.(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    expect(onNext).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'b' }), expect.objectContaining({ id: 'a' })]);
  });
});
