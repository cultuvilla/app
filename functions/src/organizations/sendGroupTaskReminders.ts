import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  groupTasksGroup,
  organizationDoc,
  organizationMembersCollection,
  organizationTaskReminderDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  addDays,
  dueTaskReminders,
  EVENT_TZ,
  madridDayKey,
  TASK_OVERDUE_WINDOW_DAYS,
  TASK_REMINDER_LEAD_DAYS,
  taskReminderId,
  type DueTaskReminder,
  type GroupTaskData,
} from '@cultuvilla/shared/models';
import { notifyGroupTask } from './groupTaskNotify';

const db = getFirestore();
const handler = 'sendGroupTaskReminders';

export interface GroupTaskReminderRunResult {
  taskCount: number;
  reminderCount: number;
}

type Task = GroupTaskData & { id: string };

/**
 * Records every reminder of the task not sent yet and returns those — the
 * ones to send now. Recorded before sending, in one transaction, so an
 * overlapping or retried run sends nothing twice; a send that then fails is
 * logged and not retried.
 */
async function claimReminders(firestore: Firestore, orgId: string, task: Task, due: DueTaskReminder[], now: Date): Promise<DueTaskReminder[]> {
  return firestore.runTransaction(async (tx) => {
    const refs = due.map((r) => organizationTaskReminderDoc(firestore, orgId, taskReminderId(task.id, r.stage, r.uid)));
    const snaps = await tx.getAll(...refs);
    const fresh = due.filter((_, i) => !snaps[i]?.exists);
    fresh.forEach((r) => {
      tx.create(organizationTaskReminderDoc(firestore, orgId, taskReminderId(task.id, r.stage, r.uid)), {
        taskId: task.id,
        stage: r.stage,
        recipientUid: r.uid,
        sentAt: now,
      });
    });
    return fresh;
  });
}

async function remindOrg(firestore: Firestore, orgId: string, tasks: Task[], now: Date, result: GroupTaskReminderRunResult): Promise<void> {
  const org = (await organizationDoc(firestore, orgId).get()).data();
  if (!org || org.status !== 'approved') return;
  const memberUids = (await organizationMembersCollection(firestore, orgId).get()).docs.map((d) => d.id);
  const members = new Set(memberUids);

  for (const task of tasks) {
    // Someone who left the group is not reminded of its chores.
    const due = dueTaskReminders(task, memberUids, now).filter((r) => members.has(r.uid));
    if (due.length === 0) continue;
    result.taskCount += 1;
    const sendable = await claimReminders(firestore, orgId, task, due, now);
    for (const r of sendable) {
      try {
        await notifyGroupTask(firestore, {
          uid: r.uid,
          notice: r.stage,
          orgId,
          orgName: org.name,
          municipalityId: org.municipalityId,
          task,
          docId: `task_${orgId}_${task.id}_${r.stage}`,
          now,
        });
        result.reminderCount += 1;
      } catch (err) {
        logger.warn('Task reminder not written', { handler, orgId, taskId: task.id, stage: r.stage, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
}

/** Every open task due around today. Exported for the handler tests; the schedule is the only production caller. */
export async function runGroupTaskReminders(firestore: Firestore, now: Date): Promise<GroupTaskReminderRunResult> {
  const result: GroupTaskReminderRunResult = { taskCount: 0, reminderCount: 0 };
  const today = madridDayKey(now);
  // One window covers all three stages: overdue up to a week back, due (or a
  // shift starting) in the next two days.
  const snap = await groupTasksGroup(firestore)
    .where('doneAt', '==', null)
    .where('dueOn', '>=', addDays(today, -TASK_OVERDUE_WINDOW_DAYS))
    .where('dueOn', '<=', addDays(today, TASK_REMINDER_LEAD_DAYS))
    .get();

  const byOrg = new Map<string, Task[]>();
  for (const doc of snap.docs) {
    const orgId = doc.ref.parent.parent?.id;
    if (!orgId) continue;
    try {
      const list = byOrg.get(orgId) ?? [];
      list.push({ id: doc.id, ...doc.data() });
      byOrg.set(orgId, list);
    } catch (err) {
      logger.warn('Group task does not parse; skipped', { handler, orgId, taskId: doc.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const [orgId, tasks] of byOrg) {
    try {
      await remindOrg(firestore, orgId, tasks, now, result);
    } catch (err) {
      // One group's bad data must not cost every other group its reminders.
      logger.error('Group task reminders failed for org', { handler, orgId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/**
 * Group task and shift reminders, as push + in-app (the notification
 * pipeline applies each user's preferences): two days before a task is due,
 * once when it is overdue, and to members who have not answered a shift that
 * still needs people within 48 h.
 *
 * Runs once a day at 10:00 Madrid, so a reminder never lands in quiet hours.
 * Each send is recorded per task, stage and member (`taskReminders`), so a
 * re-run reminds nobody twice.
 */
export const sendGroupTaskReminders = onSchedule({ schedule: 'every day 10:00', timeZone: EVENT_TZ }, async () => {
  const result = await runGroupTaskReminders(db, new Date());
  logger.info('Group task reminders run', { handler, ...result });
});
