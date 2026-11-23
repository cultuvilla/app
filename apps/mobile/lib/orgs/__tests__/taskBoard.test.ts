import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { filterTasks, groupTasksByEvent, leaderboardEvents, taskLeaderboard } from '../taskBoard';

function task(id: string, over: Partial<GroupTaskData> = {}) {
  return { id, ...buildGroupTaskData({ title: id, createdBy: 'admin', createdAt: new Date() }), ...over };
}

const TODAY = '2026-11-21';
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('filterTasks', () => {
  const open = [
    task('late', { dueOn: '2026-11-20' }),
    task('thisWeek', { dueOn: '2026-11-27', assigneeUids: ['me'] }),
    task('nextWeek', { dueOn: '2026-11-28' }),
    task('fullShift', { slots: 1, claimedUids: ['x'] }),
    task('openShift', { slots: 3, claimedUids: ['me'] }),
  ];
  const done = [task('finished', { doneAt: new Date(), doneBy: 'me' })];

  it('shows every pending task with no filter on', () => {
    expect(ids(filterTasks(open, done, new Set(), 'me', TODAY))).toEqual(ids(open));
  });
  it('narrows by each filter, and combines them', () => {
    expect(ids(filterTasks(open, done, new Set(['overdue']), 'me', TODAY))).toEqual(['late']);
    expect(ids(filterTasks(open, done, new Set(['week']), 'me', TODAY))).toEqual(['thisWeek']);
    expect(ids(filterTasks(open, done, new Set(['unassigned']), 'me', TODAY))).toEqual(['late', 'nextWeek']);
    expect(ids(filterTasks(open, done, new Set(['shiftOpen']), 'me', TODAY))).toEqual(['openShift']);
    expect(ids(filterTasks(open, done, new Set(['mine', 'shiftOpen']), 'me', TODAY))).toEqual(['openShift']);
  });
  it('swaps to the done tasks, where "mine" also means the ones I ticked', () => {
    expect(ids(filterTasks(open, done, new Set(['done', 'mine']), 'me', TODAY))).toEqual(['finished']);
  });
});

describe('groupTasksByEvent', () => {
  const events = [
    { id: 'old', title: 'Old', startDate: new Date('2026-08-14') },
    { id: 'new', title: 'New', startDate: new Date('2026-12-05') },
  ];
  const tasks = [
    task('b', { eventId: 'new', dueOn: '2026-12-01' }),
    task('a', { eventId: 'new', dueOn: '2026-11-30' }),
    task('left', { eventId: 'old' }),
    task('loose'),
    task('gone', { eventId: 'deleted' }),
  ];
  it('puts pending events oldest first, tasks soonest due, and the rest under "other", last', () => {
    const groups = groupTasksByEvent(tasks, events, { done: false });
    expect(groups.map((g) => g.key)).toEqual(['old', 'new', 'other']);
    expect(ids(groups[1]?.tasks ?? [])).toEqual(['a', 'b']);
    expect(ids(groups[2]?.tasks ?? [])).toEqual(['gone', 'loose']);
  });
  it('puts the newest event first for done tasks, and adds empty events when asked', () => {
    const extra = { id: 'blank', title: 'Blank', startDate: new Date('2027-01-01') };
    expect(groupTasksByEvent(tasks, events, { done: true }).map((g) => g.key)).toEqual(['new', 'old', 'other']);
    expect(groupTasksByEvent([], [...events, extra], { done: false, emptyEvents: [extra] }).map((g) => g.key)).toEqual(['blank']);
  });
});

describe('taskLeaderboard', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  const done = [
    task('t1', { assigneeUids: ['ana'], doneAt: new Date('2026-11-10T12:00:00Z'), eventId: 'ev' }),
    task('t2', { assigneeUids: ['ana', 'luis'], doneAt: new Date('2026-03-10T12:00:00Z') }),
    task('t3', { doneBy: 'pepa', doneAt: new Date('2026-11-12T12:00:00Z'), eventId: 'ev' }),
  ];
  it('ranks who did most this year, sharing a place on a tie, nobody at zero', () => {
    expect(taskLeaderboard(done, ['ana', 'luis', 'pepa', 'idle'], { kind: 'year' }, now)).toEqual([
      { uid: 'ana', count: 2, rank: 1 },
      { uid: 'luis', count: 1, rank: 2 },
      { uid: 'pepa', count: 1, rank: 2 },
    ]);
  });
  it('counts this month or one event on its own', () => {
    expect(taskLeaderboard(done, ['ana', 'luis', 'pepa'], { kind: 'month' }, now).map((r) => r.uid)).toEqual(['ana', 'pepa']);
    expect(taskLeaderboard(done, ['ana', 'luis', 'pepa'], { kind: 'event', eventId: 'ev' }, now).map((r) => r.uid)).toEqual(['ana', 'pepa']);
  });
  it('offers the events with done tasks, latest first', () => {
    const events = [
      { id: 'ev', title: 'Fiestas', startDate: new Date('2026-08-14') },
      { id: 'none', title: 'Cena', startDate: new Date('2026-12-14') },
    ];
    expect(leaderboardEvents(done, events).map((e) => e.id)).toEqual(['ev']);
  });
});
