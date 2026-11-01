// vi.mock factories fake the firebase/firestore SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const batchSet = vi.fn();
const batchCommit = vi.fn();
let newId = 0;

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  organizationTasksCollection: vi.fn((_db, orgId: string) => ({ _coll: `organizations/${orgId}/tasks` })),
  organizationTaskTemplatesCollection: vi.fn((_db, orgId: string) => ({ _coll: `organizations/${orgId}/taskTemplates` })),
  organizationTaskCommentsCollection: vi.fn((_db, orgId: string, taskId: string) => ({ _coll: `organizations/${orgId}/tasks/${taskId}/chat` })),
  organizationTaskCommentsWriteCollection: vi.fn((_db, orgId: string, taskId: string) => ({ _coll: `organizations/${orgId}/tasks/${taskId}/chat` })),
  organizationTaskWriteDoc: vi.fn((_db, orgId: string, coll: string, id: string) => ({ _path: `organizations/${orgId}/${coll}/${id}` })),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((coll: { _coll?: string } | undefined, id?: string) => ({ id: id ?? `new-${String(++newId)}`, _path: `${coll?._coll ?? ''}/${id ?? 'new'}` })),
  deleteDoc: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  writeBatch: vi.fn(() => ({ set: batchSet, commit: batchCommit })),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: { state: 'waitlisted' } }))) }));

import { deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  addTaskComment,
  applyTaskTemplate,
  createGroupTask,
  deleteTaskComment,
  respondToTaskShift,
  saveTasksAsTemplate,
  setGroupTaskDone,
  updateGroupTask,
} from '../../src/services/groupTaskService';

const pathOf = (ref: unknown) => (ref as { _path: string })._path;

beforeEach(() => {
  vi.clearAllMocks();
  newId = 0;
});

describe('groupTaskService', () => {
  it('createGroupTask writes a full task, signed by the admin and stamped by the server', async () => {
    const id = await createGroupTask('org1', { title: ' Asamblea ', dueOn: '2026-03-15', notes: ' ' }, 'admin1');
    const [ref, data] = vi.mocked(setDoc).mock.calls[0];
    expect(pathOf(ref)).toBe(`organizations/org1/tasks/${id}`);
    expect(data).toMatchObject({
      title: 'Asamblea', notes: null, dueOn: '2026-03-15', claimedUids: [], nextTaskId: null, doneAt: null,
      createdBy: 'admin1', createdAt: 'SERVER_TS',
    });
  });

  it('refuses a shift with no day before writing', async () => {
    await expect(createGroupTask('org1', { title: 'Montaje', slots: 3 }, 'admin1')).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('updateGroupTask writes only the editable fields', async () => {
    await updateGroupTask('org1', 't1', {
      title: 'Otro', notes: '', assigneeUids: ['a', 'a'], dueOn: null, time: null, slots: null, recurrence: null, eventId: null,
    });
    const [ref, data] = vi.mocked(updateDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(pathOf(ref)).toBe('organizations/org1/tasks/t1');
    expect(Object.keys(data).sort()).toEqual(['assigneeUids', 'dueOn', 'eventId', 'notes', 'recurrence', 'slots', 'time', 'title']);
    expect(data).toMatchObject({ notes: null, assigneeUids: ['a'] });
  });

  it('setGroupTaskDone stamps the server time and the ticker, or clears both', async () => {
    await setGroupTaskDone('org1', 't1', true, 'u1');
    await setGroupTaskDone('org1', 't1', false, 'u1');
    expect(vi.mocked(updateDoc).mock.calls.map((c) => c[1])).toEqual([{ doneAt: 'SERVER_TS', doneBy: 'u1' }, { doneAt: null, doneBy: null }]);
  });

  it('applyTaskTemplate writes every task of the template in one batch, on the event', async () => {
    await applyTaskTemplate(
      'org1',
      { items: [{ title: 'Orquesta', notes: null, offsetDays: -60, time: null, slots: null }, { title: 'Montaje', notes: null, offsetDays: 0, time: '10:00', slots: 4 }] },
      '2026-08-14',
      'ev1',
      'admin1',
    );
    expect(batchSet.mock.calls.map((c) => (c[1] as Record<string, unknown>)['dueOn'])).toEqual(['2026-06-15', '2026-08-14']);
    expect(batchSet.mock.calls.every((c) => (c[1] as Record<string, unknown>)['eventId'] === 'ev1')).toBe(true);
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('saveTasksAsTemplate keeps the checklist as offsets from the anchor', async () => {
    await saveTasksAsTemplate('org1', 'Fiestas', [{ title: 'Orquesta', notes: null, dueOn: '2026-06-15', time: null, slots: null }], '2026-08-14', 'admin1');
    const [ref, data] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(pathOf(ref)).toMatch(/^organizations\/org1\/taskTemplates\//);
    expect(data).toMatchObject({ name: 'Fiestas', items: [{ title: 'Orquesta', offsetDays: -60 }], updatedBy: 'admin1', updatedAt: 'SERVER_TS' });
  });

  it('respondToTaskShift goes through the callable', async () => {
    await expect(respondToTaskShift('org1', 't1', 'claim')).resolves.toBe('waitlisted');
    expect(vi.mocked(httpsCallable).mock.calls[0]?.[1]).toBe('respondToTaskShift');
  });

  it('addTaskComment writes under the task, trimmed and stamped by the server', async () => {
    await addTaskComment({ orgId: 'org1', taskId: 't1', uid: 'u1', authorName: 'Ana', body: ' Voy yo ' });
    const [ref, data] = vi.mocked(setDoc).mock.calls[0];
    expect(pathOf(ref)).toBe('organizations/org1/tasks/t1/chat/new');
    expect(data).toEqual({ authorUid: 'u1', authorName: 'Ana', body: 'Voy yo', createdAt: 'SERVER_TS' });
  });

  it('addTaskComment refuses an empty comment before writing', async () => {
    await expect(addTaskComment({ orgId: 'org1', taskId: 't1', uid: 'u1', authorName: 'Ana', body: '  ' })).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('deleteTaskComment removes that comment', async () => {
    await deleteTaskComment('org1', 't1', 'c1');
    expect(pathOf(vi.mocked(deleteDoc).mock.calls[0]?.[0])).toBe('organizations/org1/tasks/t1/chat/c1');
  });
});
