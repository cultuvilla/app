import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { organizationDoc, organizationTaskDoc, organizationTasksCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { freeSlots, madridDayKey, nextOccurrence, promoteWaitlist } from '@cultuvilla/shared/models';
import { notifyGroupTask } from './groupTaskNotify';

const db = getFirestore();
const handler = 'onGroupTaskUpdated';

export interface GroupTaskFollowUp {
  nextTaskId: string | null;
  promoted: string[];
}

/**
 * What follows a change to a task, reconciled against the task as it is now
 * (trigger events arrive at least once and in any order):
 *
 * - a recurring task that is done and has no `nextTaskId` gets its next
 *   occurrence, created in the same transaction that records it — so it is
 *   created exactly once, however often this runs, and undoing and redoing the
 *   task does not create a second one;
 * - a shift with free slots and a waiting list (an admin raised `slots`)
 *   promotes from the head of the list, and each promoted member is told.
 */
export async function followUpGroupTask(firestore: Firestore, orgId: string, taskId: string, now: Date): Promise<GroupTaskFollowUp> {
  const outcome = await firestore.runTransaction(async (tx): Promise<GroupTaskFollowUp> => {
    const snap = await tx.get(organizationTaskDoc(firestore, orgId, taskId));
    const task = snap.data();
    if (!task) return { nextTaskId: null, promoted: [] };
    const result: GroupTaskFollowUp = { nextTaskId: null, promoted: [] };
    const patch: { nextTaskId?: string; claimedUids?: string[]; waitlistUids?: string[] } = {};

    if (task.doneAt && task.recurrence && task.nextTaskId === null) {
      const next = nextOccurrence(task, madridDayKey(task.doneAt), now);
      if (next) {
        const nextRef = organizationTasksCollection(firestore, orgId).doc();
        tx.create(nextRef, next);
        patch.nextTaskId = nextRef.id;
        result.nextTaskId = nextRef.id;
      }
    }

    if (task.slots !== null && task.doneAt === null && task.waitlistUids.length > 0 && freeSlots(task) > 0) {
      const { promoted, claimedUids, waitlistUids } = promoteWaitlist(task);
      patch.claimedUids = claimedUids;
      patch.waitlistUids = waitlistUids;
      result.promoted = promoted;
    }

    // Unconverted: a partial update, not a whole task.
    if (Object.keys(patch).length > 0) tx.update(snap.ref.withConverter(null), patch);
    return result;
  });

  if (outcome.promoted.length > 0) {
    const org = (await organizationDoc(firestore, orgId).get()).data();
    const task = (await organizationTaskDoc(firestore, orgId, taskId).get()).data();
    if (org && task) {
      await Promise.all(
        outcome.promoted.map((uid) =>
          notifyGroupTask(firestore, {
            uid, notice: 'promoted', orgId, orgName: org.name, municipalityId: org.municipalityId, task, docId: null, now,
          }),
        ),
      );
    }
  }
  return outcome;
}

/**
 * Creates the next occurrence of a recurring task when it is closed, and
 * fills a shift's new slots from its waiting list. Its own write (nextTaskId,
 * the lists) fires it again, and that run finds nothing left to do.
 */
export const onGroupTaskUpdated = onDocumentUpdated('organizations/{orgId}/tasks/{taskId}', async (event) => {
  const after = event.data?.after.data();
  if (!after) return;
  const closedRecurring = after['doneAt'] != null && after['recurrence'] != null && after['nextTaskId'] == null;
  const slots = typeof after['slots'] === 'number' ? after['slots'] : null;
  const claimed = Array.isArray(after['claimedUids']) ? after['claimedUids'].length : 0;
  const waiting = Array.isArray(after['waitlistUids']) ? after['waitlistUids'].length : 0;
  const roomForWaitlist = slots !== null && waiting > 0 && claimed < slots;
  if (!closedRecurring && !roomForWaitlist) return;
  const { orgId, taskId } = event.params;
  const result = await followUpGroupTask(db, orgId, taskId, new Date());
  if (result.nextTaskId || result.promoted.length > 0) {
    logger.info('Group task followed up', { handler, orgId, taskId, nextTaskId: result.nextTaskId, promotedCount: result.promoted.length });
  }
});
