import { madridDayKey } from '@cultuvilla/shared/models/event';
import {
  compareTasksByDue,
  fairShareCounts,
  freeSlots,
  isTaskOverdue,
  type GroupTaskData,
} from '@cultuvilla/shared/models/organization';

type Task = GroupTaskData & { id: string };

/** The filters of the group's Tareas screen. They combine; none on is every pending task. */
export const TASK_FILTERS = ['mine', 'unassigned', 'overdue', 'week', 'shiftOpen', 'done'] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

/** Who a task is on: a shift's claimers, else its assignees. */
export function taskPeople(task: Pick<GroupTaskData, 'slots' | 'assigneeUids' | 'claimedUids'>): string[] {
  return task.slots !== null ? task.claimedUids : task.assigneeUids;
}

function addDays(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The tasks the chosen filters leave: "Hechas" swaps the pending tasks for the
 * ones done this year, and every other filter narrows what is left.
 */
export function filterTasks<T extends Task>(
  open: readonly T[],
  done: readonly T[],
  filters: ReadonlySet<TaskFilter>,
  uid: string,
  today: string,
): T[] {
  const weekEnd = addDays(today, 6);
  return (filters.has('done') ? done : open).filter(
    (task) =>
      (!filters.has('mine') || taskPeople(task).includes(uid) || task.doneBy === uid) &&
      (!filters.has('unassigned') || taskPeople(task).length === 0) &&
      (!filters.has('overdue') || isTaskOverdue(task, today)) &&
      (!filters.has('week') || (task.dueOn !== null && task.dueOn >= today && task.dueOn <= weekEnd)) &&
      (!filters.has('shiftOpen') || (task.slots !== null && freeSlots(task) > 0)),
  );
}

export type TaskGroupEvent = { id: string; title: string; startDate: Date };

/** One fold of the list: an event and its tasks, or the tasks of no event (`event: null`). */
export type TaskGroup<T> = { key: string; event: TaskGroupEvent | null; tasks: T[] };

/**
 * The tasks under their event, as the screen lists them. Pending: events
 * oldest first (one with work left over comes before the next), tasks soonest
 * due. Done: the newest event first, the last done first. A task whose event
 * is unknown joins "Otras tareas", always last. `emptyEvents` adds events with
 * no task yet, so a checklist can be started from them.
 */
export function groupTasksByEvent<T extends Task>(
  tasks: readonly T[],
  events: readonly TaskGroupEvent[],
  { done, emptyEvents = [] }: { done: boolean; emptyEvents?: readonly TaskGroupEvent[] },
): TaskGroup<T>[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const groups = new Map<string, TaskGroup<T>>();
  const other: T[] = [];
  for (const task of tasks) {
    const event = task.eventId ? byId.get(task.eventId) : undefined;
    if (!event) {
      other.push(task);
      continue;
    }
    const group = groups.get(event.id) ?? { key: event.id, event, tasks: [] };
    group.tasks.push(task);
    groups.set(event.id, group);
  }
  for (const event of emptyEvents) if (!groups.has(event.id)) groups.set(event.id, { key: event.id, event, tasks: [] });

  const byDone = (a: T, b: T) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0);
  const sortTasks = (rows: T[]) => rows.sort(done ? byDone : compareTasksByDue);
  const list = [...groups.values()].sort((a, b) => {
    const diff = (a.event?.startDate.getTime() ?? 0) - (b.event?.startDate.getTime() ?? 0);
    return done ? -diff : diff;
  });
  for (const g of list) sortTasks(g.tasks);
  return other.length > 0 ? [...list, { key: 'other', event: null, tasks: sortTasks(other) }] : list;
}

/** The period the leaderboard counts: this year, this month, or one event's tasks. */
export type LeaderboardPeriod = { kind: 'year' } | { kind: 'month' } | { kind: 'event'; eventId: string };

export type LeaderboardRow = { uid: string; count: number; rank: number };

/**
 * Who has done the most of the group's tasks in the period, most first, with
 * a shared place for a tie. Nobody is listed at zero: the board thanks people,
 * it does not point at who did nothing.
 */
export function taskLeaderboard(
  doneTasks: readonly Task[],
  memberUids: readonly string[],
  period: LeaderboardPeriod,
  now: Date = new Date(),
): LeaderboardRow[] {
  const today = madridDayKey(now);
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const inPeriod = doneTasks.filter((task) => {
    if (!task.doneAt) return false;
    if (period.kind === 'month') return madridDayKey(task.doneAt).slice(0, 7) === month;
    if (period.kind === 'event') return task.eventId === period.eventId;
    return true;
  });
  const counted = fairShareCounts(inPeriod, memberUids, year).filter((r) => r.count > 0);
  let rank = 0;
  return counted.map((row, i) => {
    if (i === 0 || counted[i - 1]?.count !== row.count) rank = i + 1;
    return { ...row, rank };
  });
}

/** The events whose done tasks the leaderboard can count on their own, the latest first. */
export function leaderboardEvents(doneTasks: readonly Task[], events: readonly TaskGroupEvent[], max = 3): TaskGroupEvent[] {
  const withDone = new Set(doneTasks.map((t) => t.eventId).filter((id): id is string => id !== null));
  return events
    .filter((e) => withDone.has(e.id))
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    .slice(0, max);
}
