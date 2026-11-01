import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { organizationDoc, organizationMemberDoc, organizationTaskDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { answerShift, madridDayKey, type ShiftAnswer, type ShiftState } from '@cultuvilla/shared/models';
import { notifyGroupTask } from './groupTaskNotify';

const db = getFirestore();
const ANSWERS: readonly ShiftAnswer[] = ['claim', 'decline', 'withdraw'];

interface RespondToTaskShiftData {
  orgId?: unknown;
  taskId?: unknown;
  answer?: unknown;
}

/**
 * A member's answer to a volunteer shift: take a slot (or a place on the
 * waiting list once it is full), say "no puedo", or take the answer back.
 * Giving up a slot hands it to the head of the waiting list, who is told.
 *
 * Callable because the cap is a count over everyone's answers: done in one
 * transaction here, two members can never both take the last slot, and no
 * client may write another member onto the list.
 */
export const respondToTaskShift = onCall<RespondToTaskShiftData, Promise<{ state: ShiftState }>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'respondToTaskShift';
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { orgId, taskId, answer } = request.data;
    if (typeof orgId !== 'string' || typeof taskId !== 'string' || !orgId || !taskId || !ANSWERS.includes(answer as ShiftAnswer)) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }
    const now = new Date();

    const { state, promoted, task } = await db.runTransaction(async (tx) => {
      const [member, snap] = await Promise.all([
        tx.get(organizationMemberDoc(db, orgId, uid)),
        tx.get(organizationTaskDoc(db, orgId, taskId)),
      ]);
      if (!member.exists) throw new HttpsError('permission-denied', 'No eres integrante del grupo.');
      const current = snap.data();
      if (!current || current.slots === null) throw new HttpsError('not-found', 'Ese turno no existe.');
      if (current.doneAt !== null || (current.dueOn !== null && current.dueOn < madridDayKey(now))) {
        throw new HttpsError('failed-precondition', 'Ese turno ya ha pasado.');
      }
      const next = answerShift(current, uid, answer as ShiftAnswer);
      // Unconverted: a partial update of the three function-owned lists.
      tx.update(snap.ref.withConverter(null), {
        claimedUids: next.claimedUids,
        waitlistUids: next.waitlistUids,
        declinedUids: next.declinedUids,
      });
      return { state: next.state, promoted: next.promoted, task: { ...current, claimedUids: next.claimedUids } };
    });

    if (promoted.length > 0) {
      const org = (await organizationDoc(db, orgId).get()).data();
      if (org) {
        await Promise.all(
          promoted.map((promotedUid) =>
            notifyGroupTask(db, {
              uid: promotedUid, notice: 'promoted', orgId, orgName: org.name, municipalityId: org.municipalityId, task, docId: null, now,
            }),
          ),
        );
      }
    }
    logger.info('Shift answered', { handler, orgId, taskId, answer, state, promotedCount: promoted.length });
    return { state };
  },
);
