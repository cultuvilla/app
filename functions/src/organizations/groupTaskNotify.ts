import type { Firestore } from 'firebase-admin/firestore';
import { userNotificationsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData, type GroupTaskData, type TaskReminderStage } from '@cultuvilla/shared/models';
import { formatDayKey } from '@cultuvilla/shared/utils';

/**
 * The `group_task` notifications: one doc per recipient under
 * `users/{uid}/notifications`, which `onNotificationCreated` pushes (applying
 * the user's preferences). Routed to `/grupos?grupo=<orgId>`.
 */

export type GroupTaskNotice = TaskReminderStage | 'promoted';

function when(task: Pick<GroupTaskData, 'dueOn' | 'time'>): string {
  if (!task.dueOn) return '';
  const day = formatDayKey(task.dueOn, 'long');
  return task.time ? `el ${day} a las ${task.time}` : `el ${day}`;
}

export function groupTaskCopy(
  notice: GroupTaskNotice,
  task: Pick<GroupTaskData, 'title' | 'dueOn' | 'time' | 'slots' | 'claimedUids'>,
  orgName: string,
): { title: string; body: string } {
  const title = `«${task.title}»`;
  const free = Math.max(0, (task.slots ?? 0) - task.claimedUids.length);
  switch (notice) {
    case 'before':
      return task.slots !== null
        ? { title: `Tienes turno · ${orgName}`, body: `${title}, ${when(task)}.` }
        : { title: `Tarea pendiente · ${orgName}`, body: `${title} vence ${when(task)}.` };
    case 'overdue':
      return { title: `Tarea vencida · ${orgName}`, body: `${title} venció ${when(task)}. Si ya está hecha, márcala como hecha.` };
    case 'shift':
      return {
        title: `Se buscan voluntarios · ${orgName}`,
        body: `${title}, ${when(task)}: ${free === 1 ? 'queda 1 plaza' : `quedan ${String(free)} plazas`}. ¿Te apuntas?`,
      };
    case 'promoted':
      return { title: `Ya tienes plaza · ${orgName}`, body: `Se ha liberado un hueco en ${title}, ${when(task)}. Cuentan contigo.` };
  }
}

export async function notifyGroupTask(
  firestore: Firestore,
  args: {
    uid: string;
    notice: GroupTaskNotice;
    orgId: string;
    orgName: string;
    municipalityId: string | null;
    task: Pick<GroupTaskData, 'title' | 'dueOn' | 'time' | 'slots' | 'claimedUids'>;
    /** A fixed id keeps a retried run from writing it twice; none = a fresh doc. */
    docId: string | null;
    now: Date;
  },
): Promise<void> {
  const copy = groupTaskCopy(args.notice, args.task, args.orgName);
  const coll = userNotificationsCollection(firestore, args.uid);
  const ref = args.docId ? coll.doc(args.docId) : coll.doc();
  await ref.set(
    buildNotificationData({
      type: 'group_task',
      title: copy.title,
      body: copy.body,
      municipalityId: args.municipalityId,
      entityKind: 'organization',
      entityId: args.orgId,
      createdAt: args.now,
    }),
  );
}
