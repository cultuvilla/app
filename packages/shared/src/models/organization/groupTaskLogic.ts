import { madridDayKey } from '../event/EventDataModel';
import { madridInstant } from '../municipality/FiestaBlockModel';
import { addDays } from './cuotaStatus';
import {
  MAX_TEMPLATE_OFFSET_DAYS,
  type GroupTaskData,
  type GroupTaskInput,
  type TaskRecurrence,
  type TaskReminderStage,
  type TaskTemplateData,
  type TaskTemplateItem,
} from './GroupTaskDataModel';

/**
 * Pure date and state logic for group tasks — shared by the app, the
 * `onGroupTaskUpdated` trigger, the `respondToTaskShift` callable and the
 * reminder job. Every day is a Madrid calendar day key (`YYYY-MM-DD`).
 */

// ── Calendar days ────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

function parts(day: string): { y: number; m: number; d: number } {
  return { y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)), d: Number(day.slice(8, 10)) };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `day` moved by whole months, on `dayOfMonth` (default: its own), clamped to the month's end. */
export function addMonths(day: string, months: number, dayOfMonth?: number): string {
  const { y, m, d } = parts(day);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year)}-${pad(month)}-${pad(Math.min(dayOfMonth ?? d, lastDayOfMonth(year, month)))}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

function monthsBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

// ── Recurrence ───────────────────────────────────────────────────────────────

function stepMonths(r: TaskRecurrence): number {
  return r.unit === 'year' ? 12 * r.interval : r.interval;
}

/**
 * The due day of the occurrence that follows one closed on `doneDay`.
 *
 * - `calendar`: the first date of the series (anchor + k steps, on the
 *   anchor's day of the month) after both the current due day and the day it
 *   was done — an asamblea closed late, or a year late, never lands in the past.
 * - `afterDone`: `interval` months/years after the day it was done.
 *
 * Null for a task that does not recur.
 */
export function nextDueOn(task: Pick<GroupTaskData, 'dueOn' | 'recurrence'>, doneDay: string): string | null {
  const r = task.recurrence;
  if (!r) return null;
  const step = stepMonths(r);
  if (r.kind === 'afterDone') return addMonths(doneDay, step);
  const anchor = r.anchorOn ?? task.dueOn ?? doneDay;
  const after = task.dueOn && task.dueOn > doneDay ? task.dueOn : doneDay;
  const anchorDay = parts(anchor).d;
  let k = Math.max(1, Math.floor(monthsBetween(anchor, after) / step));
  for (;;) {
    const candidate = addMonths(anchor, k * step, anchorDay);
    if (candidate > after) return candidate;
    k += 1;
  }
}

/**
 * The next occurrence of a recurring task closed on `doneDay`: same title,
 * notes, assignees, slots and rule, nobody answered yet, and on no event (an
 * event happens once). Null when the task does not recur.
 */
export function nextOccurrence(task: GroupTaskData, doneDay: string, createdAt: Date): GroupTaskData | null {
  const dueOn = nextDueOn(task, doneDay);
  if (!dueOn || !task.recurrence) return null;
  return {
    title: task.title,
    notes: task.notes,
    assigneeUids: task.assigneeUids,
    dueOn,
    time: task.time,
    slots: task.slots,
    claimedUids: [],
    waitlistUids: [],
    declinedUids: [],
    recurrence: task.recurrence,
    nextTaskId: null,
    eventId: null,
    doneAt: null,
    doneBy: null,
    createdBy: task.createdBy,
    createdAt,
  };
}

// ── A yearly event's checklist ───────────────────────────────────────────────

/**
 * The last day of the next `month` (1–12) from `today`, this month included:
 * "en marzo" on a yearly event's checklist is due by the end of March.
 */
export function monthEndFrom(month: number, today: string): string {
  const { y, m } = parts(today);
  const year = month >= m ? y : y + 1;
  return `${String(year)}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;
}

/** A task on a yearly event's checklist: due by the end of `month`, back every year. */
export function yearlyEventTask(
  task: { title: string; month: number },
  opts: { today: string; eventId: string },
): Omit<GroupTaskInput, 'createdBy' | 'createdAt'> {
  const dueOn = monthEndFrom(task.month, opts.today);
  return {
    title: task.title,
    dueOn,
    recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: dueOn },
    eventId: opts.eventId,
  };
}

// ── Templates ────────────────────────────────────────────────────────────────

/** The tasks a template generates on an anchor day (an event's start, or a bare day). */
export function tasksFromTemplate(
  template: Pick<TaskTemplateData, 'items'>,
  anchorOn: string,
  opts: { eventId: string | null; createdBy: string },
): GroupTaskInput[] {
  return template.items.map((item) => ({
    title: item.title,
    notes: item.notes,
    dueOn: addDays(anchorOn, item.offsetDays),
    time: item.time,
    slots: item.slots,
    eventId: opts.eventId,
    createdBy: opts.createdBy,
  }));
}

/**
 * A set of tasks (an event's checklist) as template items, dated relative to
 * `anchorOn`. A task with no due day lands on the anchor itself. Earliest first.
 */
export function templateItemsFromTasks(
  tasks: Pick<GroupTaskData, 'title' | 'notes' | 'dueOn' | 'time' | 'slots'>[],
  anchorOn: string,
): TaskTemplateItem[] {
  const clamp = (n: number) => Math.max(-MAX_TEMPLATE_OFFSET_DAYS, Math.min(MAX_TEMPLATE_OFFSET_DAYS, n));
  return tasks
    .map((t) => ({
      title: t.title,
      notes: t.notes,
      offsetDays: clamp(t.dueOn ? daysBetween(anchorOn, t.dueOn) : 0),
      time: t.time,
      slots: t.slots,
    }))
    .sort((a, b) => a.offsetDays - b.offsetDays);
}

// ── Shifts ───────────────────────────────────────────────────────────────────

export type ShiftAnswer = 'claim' | 'decline' | 'withdraw';
export type ShiftState = 'claimed' | 'waitlisted' | 'declined' | 'none';

type ShiftLists = Pick<GroupTaskData, 'claimedUids' | 'waitlistUids' | 'declinedUids'>;

export function shiftStateOf(task: ShiftLists, uid: string): ShiftState {
  if (task.claimedUids.includes(uid)) return 'claimed';
  if (task.waitlistUids.includes(uid)) return 'waitlisted';
  if (task.declinedUids.includes(uid)) return 'declined';
  return 'none';
}

export function freeSlots(task: Pick<GroupTaskData, 'slots' | 'claimedUids'>): number {
  return Math.max(0, (task.slots ?? 0) - task.claimedUids.length);
}

/** Fills free slots from the head of the waiting list. Returns who moved up. */
export function promoteWaitlist(task: ShiftLists & Pick<GroupTaskData, 'slots'>): ShiftLists & { promoted: string[] } {
  const free = freeSlots(task);
  const promoted = task.waitlistUids.slice(0, free);
  return {
    claimedUids: [...task.claimedUids, ...promoted],
    waitlistUids: task.waitlistUids.slice(promoted.length),
    declinedUids: task.declinedUids,
    promoted,
  };
}

/**
 * A member's answer to a shift. `claim` takes a free slot or joins the waiting
 * list; `decline` says "no puedo"; `withdraw` takes back any answer. Giving up
 * a slot promotes the head of the waiting list. Repeating an answer changes
 * nothing.
 */
export function answerShift(
  task: ShiftLists & Pick<GroupTaskData, 'slots'>,
  uid: string,
  answer: ShiftAnswer,
): ShiftLists & { state: ShiftState; promoted: string[] } {
  const current = shiftStateOf(task, uid);
  if ((answer === 'claim' && (current === 'claimed' || current === 'waitlisted')) || (answer === 'decline' && current === 'declined')) {
    return { ...pickLists(task), state: current, promoted: [] };
  }
  const without = (list: string[]) => list.filter((u) => u !== uid);
  const base = {
    slots: task.slots,
    claimedUids: without(task.claimedUids),
    waitlistUids: without(task.waitlistUids),
    declinedUids: without(task.declinedUids),
  };
  if (answer === 'claim') {
    if (freeSlots(base) > 0) return { ...pickLists({ ...base, claimedUids: [...base.claimedUids, uid] }), state: 'claimed', promoted: [] };
    return { ...pickLists({ ...base, waitlistUids: [...base.waitlistUids, uid] }), state: 'waitlisted', promoted: [] };
  }
  const declinedUids = answer === 'decline' ? [...base.declinedUids, uid] : base.declinedUids;
  const { promoted, ...lists } = promoteWaitlist({ ...base, declinedUids });
  return { ...lists, state: answer === 'decline' ? 'declined' : 'none', promoted };
}

function pickLists(t: ShiftLists): ShiftLists {
  return { claimedUids: t.claimedUids, waitlistUids: t.waitlistUids, declinedUids: t.declinedUids };
}

/** When a shift starts: its day at its time (midnight when it has none), Madrid. */
/**
 * Who a task's new comment pushes: its creator and the people on it (assignees,
 * or a shift's volunteers), minus the writer.
 */
export function taskCommentPushUids(
  task: Pick<GroupTaskData, 'createdBy' | 'assigneeUids' | 'claimedUids'>,
  writerUid: string,
): string[] {
  const out = new Set([task.createdBy, ...task.assigneeUids, ...task.claimedUids]);
  out.delete(writerUid);
  return [...out];
}

export function shiftStartsAt(task: Pick<GroupTaskData, 'dueOn' | 'time'>): Date | null {
  return task.dueOn ? madridInstant(task.dueOn, task.time ?? '00:00') : null;
}

// ── Status ───────────────────────────────────────────────────────────────────

export function isTaskOverdue(task: Pick<GroupTaskData, 'dueOn' | 'doneAt'>, today: string): boolean {
  return task.doneAt === null && task.dueOn !== null && task.dueOn < today;
}

/** Due day first (undated last), then title. */
export function compareTasksByDue(
  a: Pick<GroupTaskData, 'dueOn' | 'time' | 'title'>,
  b: Pick<GroupTaskData, 'dueOn' | 'time' | 'title'>,
): number {
  const ka = a.dueOn ? `${a.dueOn} ${a.time ?? ''}` : '~';
  const kb = b.dueOn ? `${b.dueOn} ${b.time ?? ''}` : '~';
  return ka === kb ? a.title.localeCompare(b.title, 'es') : ka < kb ? -1 : 1;
}

// ── Reminders ────────────────────────────────────────────────────────────────

/** Days before the due day an assignee is first reminded. */
export const TASK_REMINDER_LEAD_DAYS = 2;
/** How long after the due day an overdue task is still worth one reminder. */
export const TASK_OVERDUE_WINDOW_DAYS = 7;
/** How far ahead an open shift asks members who have not answered. */
export const SHIFT_REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;

export interface DueTaskReminder {
  uid: string;
  stage: TaskReminderStage;
}

/**
 * Who should hear about an open task today, and why. The job records each one
 * it sends, so the same answer on the next run sends nothing again.
 *
 * - `before`, in the two days up to the due day: its assignees, or a shift's
 *   members with a slot.
 * - `overdue`, once, in the week after the due day: its assignees (a shift is
 *   never overdue — it happened or it didn't).
 * - `shift`, within 48 h of a shift with free slots: every member who has not
 *   answered.
 */
export function dueTaskReminders(
  task: GroupTaskData,
  memberUids: readonly string[],
  now: Date,
): DueTaskReminder[] {
  if (task.doneAt !== null || task.dueOn === null) return [];
  const today = madridDayKey(now);
  const out: DueTaskReminder[] = [];
  const shift = task.slots !== null;
  const holders = shift ? task.claimedUids : task.assigneeUids;
  if (today <= task.dueOn && today >= addDays(task.dueOn, -TASK_REMINDER_LEAD_DAYS)) {
    holders.forEach((uid) => out.push({ uid, stage: 'before' }));
  }
  if (!shift && today > task.dueOn && today <= addDays(task.dueOn, TASK_OVERDUE_WINDOW_DAYS)) {
    task.assigneeUids.forEach((uid) => out.push({ uid, stage: 'overdue' }));
  }
  const startsAt = shift ? shiftStartsAt(task) : null;
  if (startsAt && freeSlots(task) > 0) {
    const ahead = startsAt.getTime() - now.getTime();
    if (ahead > 0 && ahead <= SHIFT_REMINDER_LEAD_MS) {
      memberUids
        .filter((uid) => shiftStateOf(task, uid) === 'none')
        .forEach((uid) => out.push({ uid, stage: 'shift' }));
    }
  }
  return out;
}

// ── Fair share ───────────────────────────────────────────────────────────────

/**
 * Who a done task counts for: a shift's volunteers, else its assignees, else
 * whoever ticked it.
 */
export function creditedUids(task: Pick<GroupTaskData, 'slots' | 'claimedUids' | 'assigneeUids' | 'doneBy'>): string[] {
  if (task.slots !== null) return task.claimedUids;
  if (task.assigneeUids.length > 0) return task.assigneeUids;
  return task.doneBy ? [task.doneBy] : [];
}

/**
 * Tasks done per member in a calendar year (Madrid) — the admin-only fair
 * share view. Members with nothing done are listed at 0, most done first.
 */
export function fairShareCounts(
  tasks: Pick<GroupTaskData, 'slots' | 'claimedUids' | 'assigneeUids' | 'doneBy' | 'doneAt'>[],
  memberUids: readonly string[],
  year: string,
): { uid: string; count: number }[] {
  const counts = new Map<string, number>(memberUids.map((uid) => [uid, 0]));
  for (const task of tasks) {
    if (!task.doneAt || madridDayKey(task.doneAt).slice(0, 4) !== year) continue;
    for (const uid of creditedUids(task)) counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }
  return [...counts.entries()].map(([uid, count]) => ({ uid, count })).sort((a, b) => b.count - a.count);
}
