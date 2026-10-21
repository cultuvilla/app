// packages/shared/test/e2e/groupTaskRules.test.ts
// Group tasks: members read, admins write, an assignee ticks their own task,
// and the shift answer lists stay function-owned.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const ORG = 'ayto1';

function task(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Revisar extintores', notes: null, assigneeUids: ['member1'], dueOn: '2026-05-10', time: null, slots: null,
    claimedUids: [], waitlistUids: [], declinedUids: [], recurrence: null, nextTaskId: null, eventId: null,
    doneAt: null, doneBy: null, createdBy: uid, createdAt: serverTimestamp(), ...overrides,
  };
}

function template(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Fiestas', items: [{ title: 'Orquesta', notes: null, offsetDays: -60, time: null, slots: null }],
    updatedBy: uid, updatedAt: serverTimestamp(), ...overrides,
  };
}

async function seed() {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // The ayuntamiento has tasks too (no socio roster needed).
    await setDoc(doc(db, `organizations/${ORG}`), { name: 'Ayuntamiento', type: 'ayuntamiento', status: 'approved', municipalityId: 'mun1' });
    for (const [uid, role] of [['admin1', 'admin'], ['member1', 'member'], ['member2', 'member']]) {
      await setDoc(doc(db, `organizations/${ORG}/members/${uid}`), { userId: uid, joinedAt: new Date(), role });
    }
    await setDoc(doc(db, `organizations/${ORG}/tasks/t1`), { ...task('admin1'), createdAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/tasks/shift`), {
      ...task('admin1', { assigneeUids: [], slots: 2, time: '10:00', claimedUids: ['member1', 'member2'], waitlistUids: ['x'] }),
      createdAt: new Date(),
    });
    await setDoc(doc(db, `organizations/${ORG}/taskTemplates/tpl`), { ...template('admin1'), updatedAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/taskReminders/t1_before_member1`), { taskId: 't1' });
  });
}

const taskDoc = (uid: string, id: string) => doc(asUser(getEnv(), uid), `organizations/${ORG}/tasks/${id}`);

beforeEach(async () => {
  await seed();
});

describe('tasks', () => {
  it('members read the group’s tasks; outsiders do not', async () => {
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'member2'), `organizations/${ORG}/tasks`)));
    await assertFails(getDoc(taskDoc('stranger', 't1')));
  });

  it('an admin creates a task, signed and stamped by the server', async () => {
    await assertSucceeds(setDoc(taskDoc('admin1', 'n1'), task('admin1')));
    await assertSucceeds(
      setDoc(taskDoc('admin1', 'n2'), task('admin1', {
        dueOn: '2026-03-15', recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: '2026-03-15' },
      })),
    );
    await assertSucceeds(setDoc(taskDoc('admin1', 'n3'), task('admin1', { slots: 4, time: '10:00' })));
  });

  it('refuses a bad shape', async () => {
    const bad: Record<string, unknown>[] = [
      { createdBy: 'member1' },
      { createdAt: new Date(2020, 0, 1) },
      { title: '' },
      { extra: true },
      { claimedUids: ['admin1'] },
      { nextTaskId: 'x' },
      { doneAt: serverTimestamp(), doneBy: 'admin1' },
      { time: '24:00' },
      { slots: 0 },
      { slots: 3, dueOn: null },
      { recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: null } },
      { recurrence: { kind: 'weekly', unit: 'week', interval: 1, anchorOn: null } },
      { recurrence: { kind: 'afterDone', unit: 'month', interval: 0, anchorOn: null } },
      { dueOn: null, recurrence: { kind: 'calendar', unit: 'month', interval: 1, anchorOn: '2026-01-01' } },
    ];
    for (const [i, over] of bad.entries()) {
      await assertFails(setDoc(taskDoc('admin1', `bad${String(i)}`), task('admin1', over)));
    }
  });

  it('a member cannot create, edit or delete a task', async () => {
    await assertFails(setDoc(taskDoc('member1', 'n1'), task('member1')));
    await assertFails(updateDoc(taskDoc('member1', 't1'), { title: 'Otro' }));
    await assertFails(deleteDoc(taskDoc('member1', 't1')));
  });

  it('an assignee ticks their own task done and undone; another member cannot', async () => {
    await assertSucceeds(updateDoc(taskDoc('member1', 't1'), { doneAt: serverTimestamp(), doneBy: 'member1' }));
    await assertSucceeds(updateDoc(taskDoc('member1', 't1'), { doneAt: null, doneBy: null }));
    await assertFails(updateDoc(taskDoc('member1', 't1'), { doneAt: serverTimestamp(), doneBy: 'member2' }));
    await assertFails(updateDoc(taskDoc('member1', 't1'), { doneAt: new Date(2020, 0, 1), doneBy: 'member1' }));
    await assertFails(updateDoc(taskDoc('member1', 't1'), { doneAt: serverTimestamp(), doneBy: 'member1', title: 'x' }));
    await assertFails(updateDoc(taskDoc('member2', 't1'), { doneAt: serverTimestamp(), doneBy: 'member2' }));
  });

  it('an admin edits and closes a task but never touches the answers or the next occurrence', async () => {
    await assertSucceeds(updateDoc(taskDoc('admin1', 't1'), { title: 'Otro', assigneeUids: ['member2'] }));
    await assertSucceeds(updateDoc(taskDoc('admin1', 't1'), { doneAt: serverTimestamp(), doneBy: 'admin1' }));
    await assertFails(updateDoc(taskDoc('admin1', 't1'), { nextTaskId: 'x' }));
    await assertFails(updateDoc(taskDoc('admin1', 'shift'), { claimedUids: ['admin1'] }));
    await assertFails(updateDoc(taskDoc('admin1', 'shift'), { waitlistUids: [] }));
    await assertSucceeds(deleteDoc(taskDoc('admin1', 't1')));
  });

  it('a shift keeps room for the people already in it', async () => {
    await assertSucceeds(updateDoc(taskDoc('admin1', 'shift'), { slots: 3 }));
    await assertFails(updateDoc(taskDoc('admin1', 'shift'), { slots: 1 }));
    await assertFails(updateDoc(taskDoc('admin1', 'shift'), { slots: null }));
  });

  it('a member cannot claim a slot by writing the list', async () => {
    await assertFails(updateDoc(taskDoc('member2', 'shift'), { waitlistUids: ['x', 'member2'] }));
  });
});

describe('taskTemplates', () => {
  const tpl = (uid: string, id: string) => doc(asUser(getEnv(), uid), `organizations/${ORG}/taskTemplates/${id}`);

  it('admins read, save and delete templates; members do none of it', async () => {
    await assertSucceeds(getDoc(tpl('admin1', 'tpl')));
    await assertSucceeds(setDoc(tpl('admin1', 'new'), template('admin1')));
    await assertSucceeds(deleteDoc(tpl('admin1', 'tpl')));
    await assertFails(getDoc(tpl('member1', 'tpl')));
    await assertFails(setDoc(tpl('member1', 'new2'), template('member1')));
  });

  it('refuses a bad template', async () => {
    await assertFails(setDoc(tpl('admin1', 'b1'), template('admin1', { items: [] })));
    await assertFails(setDoc(tpl('admin1', 'b2'), template('admin1', { updatedBy: 'member1' })));
    await assertFails(setDoc(tpl('admin1', 'b3'), template('admin1', { extra: 1 })));
    await assertFails(setDoc(tpl('admin1', 'b4'), template('admin1', { updatedAt: new Date(2020, 0, 1) })));
  });
});

describe('taskReminders', () => {
  it('admins read what was sent; nobody writes it', async () => {
    const path = `organizations/${ORG}/taskReminders/t1_before_member1`;
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'admin1'), path)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'member1'), path)));
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), path), { taskId: 't1' }));
  });
});
