// Handler tests for group tasks — the follow-up trigger (next occurrence,
// waiting-list promotion), the respondToTaskShift callable and the scheduled
// reminders — against the Firestore emulator.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { followUpGroupTask } from '../../../organizations/onGroupTaskUpdated';
import { respondToTaskShift } from '../../../organizations/respondToTaskShift';
import { runGroupTaskReminders, sendGroupTaskReminders } from '../../../organizations/sendGroupTaskReminders';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG_ID = 'org-1';
const db = () => admin.firestore();

function task(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Revisar extintores', notes: null, assigneeUids: ['u-ana'], dueOn: '2026-05-10', time: null, slots: null,
    claimedUids: [], waitlistUids: [], declinedUids: [], recurrence: null, nextTaskId: null, eventId: null,
    doneAt: null, doneBy: null, createdBy: 'u-admin', createdAt: new Date('2026-01-01'), ...overrides,
  };
}

async function seedTask(id: string, overrides: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}/tasks/${id}`).set(task(overrides));
}

async function tasks() {
  return (await db().collection(`organizations/${ORG_ID}/tasks`).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
}

async function getTask(id: string) {
  return (await db().doc(`organizations/${ORG_ID}/tasks/${id}`).get()).data() as Record<string, unknown>;
}

async function notificationsOf(uid: string) {
  return (await db().collection(`users/${uid}/notifications`).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
}

function call(uid: string | null, data: unknown) {
  const wrapped = ft.wrap(respondToTaskShift as unknown as Parameters<typeof ft.wrap>[0]);
  return wrapped({ data, auth: uid ? { uid, token: {} } : undefined } as unknown as Parameters<typeof wrapped>[0]) as Promise<{ state: string }>;
}

beforeEach(async () => {
  await resetEmulators();
  await db().doc(`organizations/${ORG_ID}`).set({
    name: 'Ayuntamiento de Villa', description: null, images: [], type: 'ayuntamiento', status: 'approved', municipalityId: 'mun-1',
    villageSlug: 'villa', requestedBy: 'u-admin', reviewedBy: null, createdAt: new Date(), reviewedAt: null,
    commentCount: 0, readCount: 0, memberCount: 0, membersPublic: true, joinPolicy: 'open', sociosListVisible: false,
  });
  for (const [uid, role] of [['u-admin', 'admin'], ['u-ana', 'member'], ['u-luis', 'member'], ['u-eva', 'member']] as const) {
    await db().doc(`organizations/${ORG_ID}/members/${uid}`).set({ userId: uid, joinedAt: new Date('2025-01-01'), role });
  }
});

afterAll(() => {
  ft.cleanup();
});

describe('followUpGroupTask (onGroupTaskUpdated)', () => {
  it('creates the next occurrence of a closed recurring task exactly once', async () => {
    await seedTask('asamblea', {
      title: 'Asamblea anual', dueOn: '2026-03-15', recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: '2026-03-15' },
      doneAt: new Date('2026-03-20T10:00:00Z'), doneBy: 'u-ana',
    });
    const first = await followUpGroupTask(db(), ORG_ID, 'asamblea', new Date('2026-03-20T10:00:01Z'));
    expect(first.nextTaskId).toBeTruthy();
    const again = await followUpGroupTask(db(), ORG_ID, 'asamblea', new Date());
    expect(again.nextTaskId).toBeNull();

    const all = await tasks();
    expect(all).toHaveLength(2);
    const next = all.find((t) => t.id === first.nextTaskId);
    expect(next).toMatchObject({ title: 'Asamblea anual', dueOn: '2027-03-15', doneAt: null, nextTaskId: null, assigneeUids: ['u-ana'] });
    expect((await getTask('asamblea')).nextTaskId).toBe(first.nextTaskId);
  });

  it('after completion: dates the next one from the day it was done', async () => {
    await seedTask('ext', { recurrence: { kind: 'afterDone', unit: 'month', interval: 12, anchorOn: null }, doneAt: new Date('2026-06-20T09:00:00Z'), doneBy: 'u-ana' });
    const { nextTaskId } = await followUpGroupTask(db(), ORG_ID, 'ext', new Date());
    expect((await getTask(String(nextTaskId))).dueOn).toBe('2027-06-20');
  });

  it('leaves an open or non-recurring task alone', async () => {
    await seedTask('open', { recurrence: { kind: 'afterDone', unit: 'month', interval: 1, anchorOn: null } });
    await seedTask('once', { doneAt: new Date(), doneBy: 'u-ana' });
    expect((await followUpGroupTask(db(), ORG_ID, 'open', new Date())).nextTaskId).toBeNull();
    expect((await followUpGroupTask(db(), ORG_ID, 'once', new Date())).nextTaskId).toBeNull();
    expect(await tasks()).toHaveLength(2);
  });

  it('fills new slots from the waiting list and tells who moved up', async () => {
    await seedTask('montaje', { assigneeUids: [], slots: 2, dueOn: '2099-08-14', claimedUids: ['u-ana'], waitlistUids: ['u-luis', 'u-eva'] });
    const { promoted } = await followUpGroupTask(db(), ORG_ID, 'montaje', new Date());
    expect(promoted).toEqual(['u-luis']);
    expect(await getTask('montaje')).toMatchObject({ claimedUids: ['u-ana', 'u-luis'], waitlistUids: ['u-eva'] });
    const [n] = await notificationsOf('u-luis');
    expect(n).toMatchObject({ type: 'group_task', entityKind: 'organization', entityId: ORG_ID, title: 'Ya tienes plaza · Ayuntamiento de Villa' });
  });
});

describe('respondToTaskShift (callable)', () => {
  beforeEach(async () => {
    await seedTask('montaje', { title: 'Montar el escenario', assigneeUids: [], slots: 1, dueOn: '2099-08-14', time: '10:00' });
  });

  it('takes the slot, then waitlists once full, and promotes when the slot is given up', async () => {
    expect(await call('u-ana', { orgId: ORG_ID, taskId: 'montaje', answer: 'claim' })).toEqual({ state: 'claimed' });
    expect(await call('u-luis', { orgId: ORG_ID, taskId: 'montaje', answer: 'claim' })).toEqual({ state: 'waitlisted' });
    expect(await call('u-ana', { orgId: ORG_ID, taskId: 'montaje', answer: 'decline' })).toEqual({ state: 'declined' });
    expect(await getTask('montaje')).toMatchObject({ claimedUids: ['u-luis'], waitlistUids: [], declinedUids: ['u-ana'] });
    const [n] = await notificationsOf('u-luis');
    expect(String(n['body'])).toContain('«Montar el escenario»');
  });

  it('two members racing for the last slot: one gets it, one waits', async () => {
    const results = await Promise.all([
      call('u-ana', { orgId: ORG_ID, taskId: 'montaje', answer: 'claim' }),
      call('u-luis', { orgId: ORG_ID, taskId: 'montaje', answer: 'claim' }),
    ]);
    expect(results.map((r) => r.state).sort()).toEqual(['claimed', 'waitlisted']);
    expect(((await getTask('montaje')).claimedUids as string[]).length).toBe(1);
  });

  it('refuses outsiders, bad answers, plain tasks and past shifts', async () => {
    await seedTask('plain');
    await seedTask('past', { assigneeUids: [], slots: 3, dueOn: '2020-01-01' });
    await expect(call(null, { orgId: ORG_ID, taskId: 'montaje', answer: 'claim' })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call('stranger', { orgId: ORG_ID, taskId: 'montaje', answer: 'claim' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('u-ana', { orgId: ORG_ID, taskId: 'montaje', answer: 'maybe' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call('u-ana', { orgId: ORG_ID, taskId: 'plain', answer: 'claim' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(call('u-ana', { orgId: ORG_ID, taskId: 'past', answer: 'claim' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('sendGroupTaskReminders', () => {
  // 10:00 Madrid on 8 May 2026: two days before a 10 May due day.
  const BEFORE = new Date('2026-05-08T08:00:00Z');

  it('runs daily at 10:00 Madrid, out of quiet hours', () => {
    const schedule = (sendGroupTaskReminders as unknown as { __endpoint: { scheduleTrigger: { schedule: string; timeZone: string } } })
      .__endpoint.scheduleTrigger;
    expect(schedule).toMatchObject({ schedule: 'every day 10:00', timeZone: 'Europe/Madrid' });
  });

  it('reminds the assignee before the due day, once, and not a member who left', async () => {
    await seedTask('t1', { assigneeUids: ['u-ana', 'u-gone'] });
    expect(await runGroupTaskReminders(db(), BEFORE)).toEqual({ taskCount: 1, reminderCount: 1 });
    expect(await runGroupTaskReminders(db(), new Date('2026-05-09T08:00:00Z'))).toMatchObject({ reminderCount: 0 });
    const [n, ...rest] = await notificationsOf('u-ana');
    expect(rest).toHaveLength(0);
    expect(n).toMatchObject({ type: 'group_task', entityId: ORG_ID, title: 'Tarea pendiente · Ayuntamiento de Villa' });
    expect(String(n['body'])).toMatch(/^«Revisar extintores» vence el domingo, 10 de mayo de 2026\.$/);
    expect(await notificationsOf('u-gone')).toHaveLength(0);
    const record = (await db().doc(`organizations/${ORG_ID}/taskReminders/t1_before_u-ana`).get()).data();
    expect(record).toMatchObject({ taskId: 't1', stage: 'before', recipientUid: 'u-ana' });
  });

  it('once overdue; never for a done task', async () => {
    await seedTask('late');
    await seedTask('done', { doneAt: new Date('2026-05-09'), doneBy: 'u-ana' });
    expect(await runGroupTaskReminders(db(), new Date('2026-05-12T08:00:00Z'))).toEqual({ taskCount: 1, reminderCount: 1 });
    const notes = await notificationsOf('u-ana');
    expect(notes.map((n) => n.title)).toEqual(['Tarea vencida · Ayuntamiento de Villa']);
  });

  it('asks the members who have not answered a shift short of people, within 48 h', async () => {
    await seedTask('montaje', { assigneeUids: [], slots: 3, dueOn: '2026-05-10', time: '10:00', claimedUids: ['u-ana'], declinedUids: ['u-luis'] });
    await runGroupTaskReminders(db(), BEFORE);
    expect((await notificationsOf('u-eva')).map((n) => n.title)).toEqual(['Se buscan voluntarios · Ayuntamiento de Villa']);
    expect((await notificationsOf('u-admin')).map((n) => n.body)).toEqual([expect.stringContaining('quedan 2 plazas')]);
    expect((await notificationsOf('u-ana')).map((n) => n.title)).toEqual(['Tienes turno · Ayuntamiento de Villa']);
    expect(await notificationsOf('u-luis')).toHaveLength(0);
  });
});
