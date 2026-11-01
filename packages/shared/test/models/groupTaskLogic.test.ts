import { describe, it, expect } from 'vitest';
import {
  addMonths,
  answerShift,
  buildGroupTaskData,
  buildTaskTemplateData,
  compareTasksByDue,
  daysBetween,
  dueTaskReminders,
  fairShareCounts,
  GroupTaskDataSchema,
  monthEndFrom,
  yearlyEventTask,
  nextDueOn,
  nextOccurrence,
  promoteWaitlist,
  shiftStartsAt,
  taskCommentPushUids,
  shiftStateOf,
  TaskTemplateDataSchema,
  tasksFromTemplate,
  templateItemsFromTasks,
  type GroupTaskData,
  type TaskRecurrence,
} from '../../src/models/organization';

function task(over: Partial<GroupTaskData> = {}): GroupTaskData {
  return { ...buildGroupTaskData({ title: 'Asamblea', createdBy: 'admin', createdAt: new Date('2026-01-01') }), ...over };
}

const calendar = (unit: 'month' | 'year', anchorOn: string, interval = 1): TaskRecurrence => ({ kind: 'calendar', unit, interval, anchorOn });
const afterDone = (unit: 'month' | 'year', interval: number): TaskRecurrence => ({ kind: 'afterDone', unit, interval, anchorOn: null });

describe('calendar days', () => {
  it('adds months, clamped to the end of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });

  it('counts days across a DST change and a year end', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-12-31', '2026-10-02')).toBe(-90);
  });
});

describe('nextDueOn', () => {
  it('a fixed yearly date: the asamblea on 15 March, closed on time or late', () => {
    const t = task({ dueOn: '2026-03-15', recurrence: calendar('year', '2026-03-15') });
    expect(nextDueOn(t, '2026-03-14')).toBe('2027-03-15');
    expect(nextDueOn(t, '2026-03-20')).toBe('2027-03-15');
  });

  it('a fixed date never lands in the past when closed more than a period late', () => {
    const t = task({ dueOn: '2026-03-15', recurrence: calendar('year', '2026-03-15') });
    expect(nextDueOn(t, '2027-04-01')).toBe('2028-03-15');
  });

  it('a fixed monthly date keeps its day of the month after February', () => {
    const anchor = '2026-01-31';
    const feb = nextDueOn(task({ dueOn: anchor, recurrence: calendar('month', anchor) }), '2026-01-30');
    expect(feb).toBe('2026-02-28');
    expect(nextDueOn(task({ dueOn: feb, recurrence: calendar('month', anchor) }), '2026-02-28')).toBe('2026-03-31');
  });

  it('a fixed date every 3 months', () => {
    const t = task({ dueOn: '2026-01-10', recurrence: calendar('month', '2026-01-10', 3) });
    expect(nextDueOn(t, '2026-01-10')).toBe('2026-04-10');
  });

  it('after completion: N months after the day it was done', () => {
    const t = task({ dueOn: '2026-05-01', recurrence: afterDone('month', 12) });
    expect(nextDueOn(t, '2026-06-20')).toBe('2027-06-20');
    expect(nextDueOn(task({ recurrence: afterDone('year', 2) }), '2026-02-10')).toBe('2028-02-10');
  });

  it('null for a task that does not recur', () => {
    expect(nextDueOn(task({ dueOn: '2026-05-01' }), '2026-05-01')).toBeNull();
  });
});

describe('nextOccurrence', () => {
  it('copies the task with nobody answered, off any event, not done', () => {
    const closed = task({
      dueOn: '2026-03-15', recurrence: calendar('year', '2026-03-15'), assigneeUids: ['u1'], slots: 4, time: '10:00',
      claimedUids: ['u2'], waitlistUids: ['u3'], declinedUids: ['u4'], eventId: 'ev1', doneAt: new Date(), doneBy: 'u1',
    });
    const next = nextOccurrence(closed, '2026-03-15', new Date('2026-03-15T10:00:00Z'));
    expect(next).toMatchObject({
      dueOn: '2027-03-15', assigneeUids: ['u1'], slots: 4, time: '10:00', claimedUids: [], waitlistUids: [], declinedUids: [],
      eventId: null, doneAt: null, doneBy: null, nextTaskId: null, recurrence: closed.recurrence,
    });
    expect(() => GroupTaskDataSchema.parse(next)).not.toThrow();
  });
});

describe('schema', () => {
  it('refuses a shift with no day and a calendar rule with no anchor', () => {
    expect(() => GroupTaskDataSchema.parse(task({ slots: 3 }))).toThrow();
    expect(() => GroupTaskDataSchema.parse(task({ dueOn: '2026-01-01', recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: null } }))).toThrow();
    expect(() => GroupTaskDataSchema.parse(task({ time: '25:00' }))).toThrow();
  });
});

describe('templates', () => {
  const template = buildTaskTemplateData({
    name: ' Fiestas de agosto ',
    updatedBy: 'admin',
    items: [
      { title: 'Contratar la orquesta', notes: '', offsetDays: -60, time: null, slots: null },
      { title: 'Montar el escenario', notes: null, offsetDays: 0, time: '10:00', slots: 4 },
    ],
  });

  it('builds a valid template, trimmed', () => {
    expect(template.name).toBe('Fiestas de agosto');
    expect(template.items[0]?.notes).toBeNull();
    expect(() => TaskTemplateDataSchema.parse(template)).not.toThrow();
  });

  it('generates tasks dated from the anchor', () => {
    const tasks = tasksFromTemplate(template, '2026-08-14', { eventId: 'ev1', createdBy: 'admin' });
    expect(tasks.map((t) => [t.title, t.dueOn, t.slots, t.eventId])).toEqual([
      ['Contratar la orquesta', '2026-06-15', null, 'ev1'],
      ['Montar el escenario', '2026-08-14', 4, 'ev1'],
    ]);
  });

  it('saves a checklist back as offsets from its anchor, earliest first', () => {
    const items = templateItemsFromTasks(
      [task({ title: 'B', dueOn: '2026-08-14' }), task({ title: 'A', dueOn: '2026-06-15' }), task({ title: 'C', dueOn: null })],
      '2026-08-14',
    );
    expect(items.map((i) => [i.title, i.offsetDays])).toEqual([['A', -60], ['B', 0], ['C', 0]]);
  });
});

describe('shifts', () => {
  const shift = (over: Partial<GroupTaskData> = {}) => task({ dueOn: '2026-08-14', time: '10:00', slots: 2, ...over });

  it('claims a free slot, then waitlists once full', () => {
    const a = answerShift(shift(), 'u1', 'claim');
    expect(a).toMatchObject({ state: 'claimed', claimedUids: ['u1'] });
    const b = answerShift(shift({ claimedUids: ['u1', 'u2'] }), 'u3', 'claim');
    expect(b).toMatchObject({ state: 'waitlisted', claimedUids: ['u1', 'u2'], waitlistUids: ['u3'] });
  });

  it('repeating a claim changes nothing', () => {
    expect(answerShift(shift({ claimedUids: ['u1'] }), 'u1', 'claim')).toMatchObject({ state: 'claimed', claimedUids: ['u1'], promoted: [] });
  });

  it('giving up a slot promotes the head of the waiting list', () => {
    const s = shift({ claimedUids: ['u1', 'u2'], waitlistUids: ['u3', 'u4'] });
    expect(answerShift(s, 'u1', 'withdraw')).toMatchObject({ state: 'none', claimedUids: ['u2', 'u3'], waitlistUids: ['u4'], promoted: ['u3'] });
    expect(answerShift(s, 'u2', 'decline')).toMatchObject({ state: 'declined', claimedUids: ['u1', 'u3'], declinedUids: ['u2'], promoted: ['u3'] });
  });

  it('a waitlisted member who declines promotes nobody', () => {
    const s = shift({ claimedUids: ['u1', 'u2'], waitlistUids: ['u3'] });
    expect(answerShift(s, 'u3', 'decline')).toMatchObject({ claimedUids: ['u1', 'u2'], waitlistUids: [], declinedUids: ['u3'], promoted: [] });
  });

  it('more slots promote as many as fit', () => {
    expect(promoteWaitlist(shift({ slots: 3, claimedUids: ['u1'], waitlistUids: ['u2', 'u3', 'u4'] }))).toMatchObject({
      claimedUids: ['u1', 'u2', 'u3'], waitlistUids: ['u4'], promoted: ['u2', 'u3'],
    });
  });

  it('starts at its Madrid wall time, in summer and in winter', () => {
    expect(shiftStartsAt(shift())?.toISOString()).toBe('2026-08-14T08:00:00.000Z');
    expect(shiftStartsAt(shift({ dueOn: '2026-12-05', time: null }))?.toISOString()).toBe('2026-12-04T23:00:00.000Z');
  });

  it('knows each member’s state', () => {
    const s = shift({ claimedUids: ['a'], waitlistUids: ['b'], declinedUids: ['c'] });
    expect(['a', 'b', 'c', 'd'].map((u) => shiftStateOf(s, u))).toEqual(['claimed', 'waitlisted', 'declined', 'none']);
  });
});

describe('dueTaskReminders', () => {
  const at = (iso: string) => new Date(iso);

  it('reminds the assignees in the two days up to the due day', () => {
    const t = task({ dueOn: '2026-05-10', assigneeUids: ['u1', 'u2'] });
    expect(dueTaskReminders(t, [], at('2026-05-07T08:00:00Z'))).toEqual([]);
    expect(dueTaskReminders(t, [], at('2026-05-08T08:00:00Z'))).toEqual([{ uid: 'u1', stage: 'before' }, { uid: 'u2', stage: 'before' }]);
    expect(dueTaskReminders(t, [], at('2026-05-10T08:00:00Z'))).toHaveLength(2);
  });

  it('overdue once in the week after; nothing when done or undated', () => {
    const t = task({ dueOn: '2026-05-10', assigneeUids: ['u1'] });
    expect(dueTaskReminders(t, [], at('2026-05-11T08:00:00Z'))).toEqual([{ uid: 'u1', stage: 'overdue' }]);
    expect(dueTaskReminders(t, [], at('2026-05-18T08:00:00Z'))).toEqual([]);
    expect(dueTaskReminders({ ...t, doneAt: new Date() }, [], at('2026-05-11T08:00:00Z'))).toEqual([]);
    expect(dueTaskReminders(task({ assigneeUids: ['u1'] }), [], at('2026-05-11T08:00:00Z'))).toEqual([]);
  });

  it('asks the members who have not answered an open shift within 48 h', () => {
    const s = task({ dueOn: '2026-08-14', time: '10:00', slots: 3, claimedUids: ['a'], declinedUids: ['c'] });
    const members = ['a', 'b', 'c', 'd'];
    // 12 August 10:00 Madrid: exactly 48 h ahead.
    expect(dueTaskReminders(s, members, at('2026-08-12T08:00:00Z'))).toEqual([
      { uid: 'a', stage: 'before' },
      { uid: 'b', stage: 'shift' },
      { uid: 'd', stage: 'shift' },
    ]);
    expect(dueTaskReminders(s, members, at('2026-08-11T08:00:00Z'))).toEqual([]);
    // Full: nobody is asked any more.
    expect(dueTaskReminders({ ...s, claimedUids: ['a', 'b', 'd'] }, members, at('2026-08-13T08:00:00Z')).filter((r) => r.stage === 'shift')).toEqual([]);
    // A shift is never overdue.
    expect(dueTaskReminders(s, members, at('2026-08-15T08:00:00Z'))).toEqual([]);
  });
});

describe('fairShareCounts', () => {
  it('counts done tasks this year: shift volunteers, else assignees, else who ticked it', () => {
    const done = new Date('2026-06-01T10:00:00Z');
    const counts = fairShareCounts(
      [
        task({ assigneeUids: ['a', 'b'], doneAt: done, doneBy: 'a' }),
        task({ doneAt: done, doneBy: 'c' }),
        task({ dueOn: '2026-06-01', slots: 2, claimedUids: ['a', 'c'], doneAt: done, doneBy: 'admin' }),
        task({ assigneeUids: ['b'], doneAt: new Date('2025-12-31T23:30:00Z'), doneBy: 'b' }), // 1 Jan 2026 in Madrid
        task({ assigneeUids: ['b'], doneAt: new Date('2025-06-01'), doneBy: 'b' }),
        task({ assigneeUids: ['d'] }),
      ],
      ['a', 'b', 'c', 'd'],
      '2026',
    );
    expect(counts).toEqual([
      { uid: 'a', count: 2 },
      { uid: 'b', count: 2 },
      { uid: 'c', count: 2 },
      { uid: 'd', count: 0 },
    ]);
  });
});

describe('compareTasksByDue', () => {
  it('sorts by day and time, undated last', () => {
    const list = [task({ title: 'x' }), task({ title: 'b', dueOn: '2026-01-02' }), task({ title: 'a', dueOn: '2026-01-02', time: '09:00' }), task({ title: 'c', dueOn: '2026-01-01' })];
    expect([...list].sort(compareTasksByDue).map((t) => t.title)).toEqual(['c', 'b', 'a', 'x']);
  });
});

describe("a yearly event's checklist", () => {
  it('is due by the end of the next such month, this month included', () => {
    expect(monthEndFrom(3, '2026-11-01')).toBe('2027-03-31');
    expect(monthEndFrom(11, '2026-11-20')).toBe('2026-11-30');
    expect(monthEndFrom(12, '2026-11-20')).toBe('2026-12-31');
    expect(monthEndFrom(2, '2027-01-10')).toBe('2027-02-28');
  });

  it('comes back every year, on the event', () => {
    const task = yearlyEventTask({ title: 'Contratar la orquesta', month: 3 }, { today: '2026-11-01', eventId: 'fiestas' });
    expect(task).toEqual({
      title: 'Contratar la orquesta',
      dueOn: '2027-03-31',
      recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: '2027-03-31' },
      eventId: 'fiestas',
    });
    const data = buildGroupTaskData({ ...task, createdBy: 'u' });
    expect(GroupTaskDataSchema.parse(data)).toBeTruthy();
    expect(nextDueOn(data, '2027-03-15')).toBe('2028-03-31');
  });
});

describe('taskCommentPushUids', () => {
  it('is the creator and the people on the task, once each, without the writer', () => {
    expect(taskCommentPushUids({ createdBy: 'c', assigneeUids: ['a', 'c'], claimedUids: ['b'] }, 'x')).toEqual(['c', 'a', 'b']);
    expect(taskCommentPushUids({ createdBy: 'c', assigneeUids: ['a'], claimedUids: [] }, 'a')).toEqual(['c']);
  });
});
