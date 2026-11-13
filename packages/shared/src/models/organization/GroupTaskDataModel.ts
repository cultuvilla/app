import { z } from 'zod';
import { DayKeySchema } from '../municipality/FiestaBlockModel';

/**
 * A group's chores, at `organizations/{orgId}/tasks/{taskId}` — every org type,
 * the ayuntamiento included. Every member reads, creates, assigns, edits and
 * ticks them done or undone; admins and a task's creator delete it.
 *
 * Three shapes share the doc:
 * - a plain task: title, notes, assignees, a due day;
 * - a recurring task (`recurrence`): closing it makes `onGroupTaskUpdated`
 *   create the next occurrence, once (`nextTaskId` records it);
 * - a volunteer shift (`slots` set): members answer through the
 *   `respondToTaskShift` callable, which keeps `claimedUids` within the cap and
 *   the waiting list in order. The three answer lists are function-owned.
 *
 * Dates are Madrid calendar days (`YYYY-MM-DD`), like the cuota's.
 */

/** `HH:MM`, 24 h, Madrid wall time — a shift's start. */
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'not a time of day');
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

export const RecurrenceUnitSchema = z.enum(['month', 'year']);
export type RecurrenceUnit = z.infer<typeof RecurrenceUnitSchema>;

/**
 * `calendar` — fixed dates: every N months/years counted from `anchorOn` (the
 * first due day, which keeps "the 31st" from drifting to the 28th after
 * February). `afterDone` — N months/years after the day it was last done.
 */
export const RecurrenceKindSchema = z.enum(['calendar', 'afterDone']);
export type RecurrenceKind = z.infer<typeof RecurrenceKindSchema>;

export const MAX_RECURRENCE_INTERVAL = 24;

export const TaskRecurrenceSchema = z
  .object({
    kind: RecurrenceKindSchema,
    unit: RecurrenceUnitSchema,
    interval: z.number().int().min(1).max(MAX_RECURRENCE_INTERVAL),
    anchorOn: DayKeySchema.nullable(),
  })
  .refine((r) => r.kind !== 'calendar' || r.anchorOn !== null, 'a calendar recurrence needs its anchor day');
export type TaskRecurrence = z.infer<typeof TaskRecurrenceSchema>;

export const MAX_TASK_ASSIGNEES = 20;
export const MAX_SHIFT_SLOTS = 100;
export const MAX_TASK_TITLE = 120;
export const MAX_TASK_NOTES = 1000;

const GroupTaskObjectSchema = z.object({
    title: z.string().min(1).max(MAX_TASK_TITLE),
    notes: z.string().max(MAX_TASK_NOTES).nullable(),
    assigneeUids: z.array(z.string()).max(MAX_TASK_ASSIGNEES),
    dueOn: DayKeySchema.nullable(),
    time: TimeOfDaySchema.nullable(),
    /** A volunteer shift when set: how many people it needs. */
    slots: z.number().int().min(1).max(MAX_SHIFT_SLOTS).nullable(),
    /** Function-owned (respondToTaskShift): who took a slot, in order. */
    claimedUids: z.array(z.string()),
    /** Function-owned: who asked for a slot once it was full, first first. */
    waitlistUids: z.array(z.string()),
    /** Function-owned: who said they can't come — they are not reminded. */
    declinedUids: z.array(z.string()),
    recurrence: TaskRecurrenceSchema.nullable(),
    /** Function-owned: the occurrence created when this one was closed. */
    nextTaskId: z.string().nullable(),
    /** The group event this task is on the checklist of. */
    eventId: z.string().nullable(),
    doneAt: z.date().nullable(),
    doneBy: z.string().nullable(),
    createdBy: z.string(),
    createdAt: z.date(),
  });

export const GroupTaskDataSchema = GroupTaskObjectSchema
  .refine((t) => t.slots === null || t.dueOn !== null, 'a shift needs its day')
  .refine((t) => t.recurrence?.kind !== 'calendar' || t.dueOn !== null, 'a calendar recurrence needs a due day');
export type GroupTaskData = z.infer<typeof GroupTaskDataSchema>;

/** Function-owned: no client write may change them. */
export const GROUP_TASK_FUNCTION_FIELDS = ['claimedUids', 'waitlistUids', 'declinedUids', 'nextTaskId'] as const;

export interface GroupTaskInput {
  title: string;
  notes?: string | null;
  assigneeUids?: string[];
  dueOn?: string | null;
  time?: string | null;
  slots?: number | null;
  recurrence?: TaskRecurrence | null;
  eventId?: string | null;
  createdBy: string;
  createdAt?: Date;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function buildGroupTaskData(input: GroupTaskInput): GroupTaskData {
  return {
    title: input.title.trim(),
    notes: blankToNull(input.notes),
    assigneeUids: [...new Set(input.assigneeUids ?? [])],
    dueOn: input.dueOn ?? null,
    time: blankToNull(input.time),
    slots: input.slots ?? null,
    claimedUids: [],
    waitlistUids: [],
    declinedUids: [],
    recurrence: input.recurrence ?? null,
    nextTaskId: null,
    eventId: input.eventId ?? null,
    doneAt: null,
    doneBy: null,
    createdBy: input.createdBy,
    createdAt: input.createdAt ?? new Date(),
  };
}

/** The fields an admin edits on an existing task. */
export const GroupTaskEditSchema = GroupTaskObjectSchema.pick({
  title: true,
  notes: true,
  assigneeUids: true,
  dueOn: true,
  time: true,
  slots: true,
  recurrence: true,
  eventId: true,
})
  .refine((t) => t.slots === null || t.dueOn !== null, 'a shift needs its day')
  .refine((t) => t.recurrence?.kind !== 'calendar' || t.dueOn !== null, 'a calendar recurrence needs a due day');
export type GroupTaskEdit = z.infer<typeof GroupTaskEditSchema>;

export function isShift(task: Pick<GroupTaskData, 'slots'>): boolean {
  return task.slots !== null;
}

// ── Templates ────────────────────────────────────────────────────────────────

export const MAX_TEMPLATE_ITEMS = 50;
/** Two years either side of the anchor: "book the band, 60 days before". */
export const MAX_TEMPLATE_OFFSET_DAYS = 730;

export const TaskTemplateItemSchema = z.object({
  title: z.string().min(1).max(MAX_TASK_TITLE),
  notes: z.string().max(MAX_TASK_NOTES).nullable(),
  /** Days from the anchor: negative = before it ("-60" is 60 days before). */
  offsetDays: z.number().int().min(-MAX_TEMPLATE_OFFSET_DAYS).max(MAX_TEMPLATE_OFFSET_DAYS),
  time: TimeOfDaySchema.nullable(),
  slots: z.number().int().min(1).max(MAX_SHIFT_SLOTS).nullable(),
});
export type TaskTemplateItem = z.infer<typeof TaskTemplateItemSchema>;

/**
 * A reusable checklist at `organizations/{orgId}/taskTemplates/{id}` ("Fiestas
 * de agosto"): tasks dated relative to one anchor — an event's start or a bare
 * day. Applying it generates ordinary tasks; assignees are not kept, since the
 * people change from year to year. Admins only.
 */
export const TaskTemplateDataSchema = z.object({
  name: z.string().min(1).max(80),
  items: z.array(TaskTemplateItemSchema).min(1).max(MAX_TEMPLATE_ITEMS),
  /** The admin who last saved it. */
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type TaskTemplateData = z.infer<typeof TaskTemplateDataSchema>;

export interface TaskTemplateInput {
  name: string;
  items: TaskTemplateItem[];
  updatedBy: string;
  updatedAt?: Date;
}

export function buildTaskTemplateData(input: TaskTemplateInput): TaskTemplateData {
  return {
    name: input.name.trim(),
    items: input.items.map((i) => ({
      title: i.title.trim(),
      notes: blankToNull(i.notes),
      offsetDays: i.offsetDays,
      time: blankToNull(i.time),
      slots: i.slots,
    })),
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt ?? new Date(),
  };
}

// ── Reminders ────────────────────────────────────────────────────────────────

/**
 * `before` — due soon (an assignee, or a member with a slot); `overdue` — once,
 * after the due day; `shift` — a shift with free slots starts within 48 h and
 * this member has not answered.
 */
export const TaskReminderStageSchema = z.enum(['before', 'overdue', 'shift']);
export type TaskReminderStage = z.infer<typeof TaskReminderStageSchema>;

/**
 * One reminder the scheduled job sent, at
 * `taskReminders/{taskId}_{stage}_{uid}`. Created before sending, so a retried
 * run sends nothing twice. Function-owned; admins read it.
 */
export const TaskReminderDataSchema = z.object({
  taskId: z.string(),
  stage: TaskReminderStageSchema,
  recipientUid: z.string(),
  sentAt: z.date(),
});
export type TaskReminderData = z.infer<typeof TaskReminderDataSchema>;

export function taskReminderId(taskId: string, stage: TaskReminderStage, uid: string): string {
  return `${taskId}_${stage}_${uid}`;
}
