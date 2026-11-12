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
  cosaRequestChatCollection: vi.fn((_db, id: string) => ({ _coll: `cosaRequests/${id}/chat` })),
  cosaRequestChatWriteCollection: vi.fn((_db, id: string) => ({ _coll: `cosaRequests/${id}/chat` })),
  cosaSlotsCollection: vi.fn((_db, id: string) => ({ _coll: `cosas/${id}/slots` })),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((coll: { _coll?: string } | undefined, id?: string) => ({ id: id ?? `new-${String(++newId)}`, _path: `${coll?._coll ?? ''}/${id ?? 'new'}` })),
  deleteDoc: vi.fn(),
  limit: vi.fn((n: number) => ({ _limit: n })),
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

import { deleteDoc, getDocs, limit, onSnapshot, orderBy, setDoc, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  bookReservaSlot,
  setReservaBlackouts,
  watchCosaSlots,
  createCosa,
  deleteCosaRequestChatMessage,
  getMyPendingCosaRequests,
  sendCosaRequestChatMessage,
  watchCosaRequestChat,
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
      kind: 'prestamo', title: ' Llave del gimnasio ', category: 'deporte', description: ' ', createdBy: 'admin1', createdByName: 'Alcalde',
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
      createCosa({ municipalityId: 'm1', orgId: 'o1', audience: 'integrantes', ownerUid: 'u1', ownerName: 'Ana', kind: 'prestamo', title: '', category: 'otros', createdBy: 'u1', createdByName: 'Ana' }),
    ).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('updateCosa edits only what its manager may change', async () => {
    const location = { coordinates: { lat: 40, lng: -3 }, displayName: 'Plaza' };
    await updateCosa('c1', {
      kind: 'regalo', title: 'Sofá ', description: null, category: 'otros', imageURL: null, conditions: ' ',
      location, locationNote: ' en el portal ', status: 'paused', reserva: null,
    });
    const [ref, data] = vi.mocked(updateDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(pathOf(ref)).toBe('cosas/c1');
    expect(data).toEqual({
      kind: 'regalo', title: 'Sofá', description: null, category: 'otros', imageURL: null, conditions: null,
      location, locationNote: 'en el portal', status: 'paused', reserva: null, updatedAt: 'SERVER_TS',
    });
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

  it('bookReservaSlot sends the slot start as an ISO instant through the callable', async () => {
    callable.mockResolvedValueOnce({ data: { requestId: 'r9', status: 'accepted' } } as never);
    await expect(bookReservaSlot('c1', new Date('2026-11-12T17:00:00.000Z'), '  ')).resolves.toEqual({ requestId: 'r9', status: 'accepted' });
    expect(httpsCallable).toHaveBeenCalledWith({}, 'bookReservaSlot');
    expect(callable).toHaveBeenCalledWith({ cosaId: 'c1', startAt: '2026-11-12T17:00:00.000Z', message: null });
  });

  it('setReservaBlackouts goes through the callable', async () => {
    callable.mockResolvedValueOnce({ data: { cancelled: 2 } } as never);
    await expect(setReservaBlackouts('c1', ['2026-11-12'])).resolves.toEqual({ cancelled: 2 });
    expect(httpsCallable).toHaveBeenCalledWith({}, 'setReservaBlackouts');
    expect(callable).toHaveBeenCalledWith({ cosaId: 'c1', blackouts: ['2026-11-12'] });
  });

  it('watchCosaSlots asks for the slots starting in the window', () => {
    const from = new Date('2026-11-09T00:00:00.000Z');
    const to = new Date('2026-11-16T00:00:00.000Z');
    watchCosaSlots('c1', from, to, vi.fn(), vi.fn());
    expect(where).toHaveBeenCalledWith('startAt', '>=', from);
    expect(where).toHaveBeenCalledWith('startAt', '<', to);
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
    expect(where).toHaveBeenCalledWith('holderUid', '==', 'u1');
    expect(where).toHaveBeenCalledWith('ownerUid', '==', null);
    // Mine, the shared cosas I hold, and one per group.
    expect(listeners).toHaveLength(4);
    const snap = (rows: { id: string; at: number; holderUid?: string | null }[]) => ({
      docs: rows.map((r) => ({
        id: r.id,
        data: () => ({ createdAt: new Date(r.at), status: 'pending', cosaKind: 'prestamo', startAt: null, holderUid: r.holderUid ?? null }),
      })),
      metadata: { fromCache: false, hasPendingWrites: false },
    });
    listeners[0]?.(snap([{ id: 'a', at: 1 }, { id: 'heldByOther', at: 5, holderUid: 'u9' }]));
    listeners[1]?.(snap([{ id: 'held', at: 4, holderUid: 'u1' }]));
    listeners[2]?.(snap([{ id: 'b', at: 3 }]));
    expect(onNext).not.toHaveBeenCalled();
    // An org whose admin rights went answers empty instead of failing the merge.
    errors[3]?.(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    // A shared cosa someone else holds is theirs to answer, not mine.
    expect(onNext).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'held' }),
      expect.objectContaining({ id: 'b' }),
      expect.objectContaining({ id: 'a' }),
    ]);
  });

  it('watchCosaRequestsToAnswer leaves out a booking whose slot has started', () => {
    const listeners: ((snap: unknown) => void)[] = [];
    vi.mocked(onSnapshot).mockImplementation(((_q: unknown, next: (s: unknown) => void) => {
      listeners.push(next);
      return () => undefined;
    }) as never);
    const onNext = vi.fn();
    watchCosaRequestsToAnswer('u1', [], onNext, vi.fn());
    const row = (id: string, startAt: Date | null, cosaKind: string) => ({
      id, data: () => ({ createdAt: new Date(1), status: 'pending', cosaKind, startAt, holderUid: null }),
    });
    listeners[1]?.({ docs: [], metadata: { fromCache: false, hasPendingWrites: false } });
    listeners[0]?.({
      docs: [
        row('loan', null, 'prestamo'),
        row('started', new Date(Date.now() - 60_000), 'reserva'),
        row('ahead', new Date(Date.now() + 3_600_000), 'reserva'),
      ],
      metadata: { fromCache: false, hasPendingWrites: false },
    });
    const last = onNext.mock.lastCall?.[0] as { id: string }[] | undefined;
    expect(last?.map((r) => r.id).sort()).toEqual(['ahead', 'loan']);
  });

  it("sendCosaRequestChatMessage writes a trimmed message into the request's chat, stamped by the server", async () => {
    const id = await sendCosaRequestChatMessage({ requestId: 'r1', uid: 'u1', authorName: 'Ana', body: '  El sábado  ' });
    expect(id).toBe('new-1');
    const [ref, data] = vi.mocked(setDoc).mock.calls[0] ?? [];
    expect(pathOf(ref)).toBe('cosaRequests/r1/chat/new');
    expect(data).toEqual({ authorUid: 'u1', authorName: 'Ana', body: 'El sábado', createdAt: 'SERVER_TS' });
  });

  it('sendCosaRequestChatMessage refuses an empty message without writing', async () => {
    await expect(sendCosaRequestChatMessage({ requestId: 'r1', uid: 'u1', authorName: 'Ana', body: '   ' })).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('watchCosaRequestChat reads the newest page; deleteCosaRequestChatMessage removes one message', async () => {
    vi.mocked(onSnapshot).mockImplementation(() => () => undefined);
    watchCosaRequestChat('r1', 50, vi.fn(), vi.fn());
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(limit).toHaveBeenCalledWith(50);
    await deleteCosaRequestChatMessage('r1', 'm1');
    expect(pathOf(vi.mocked(deleteDoc).mock.calls[0]?.[0])).toBe('cosaRequests/r1/chat/m1');
  });
});
