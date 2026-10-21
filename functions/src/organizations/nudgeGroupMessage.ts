import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  organizationDoc,
  organizationMemberDoc,
  organizationMessageDoc,
  organizationMessageReadsCollection,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildNotificationData,
  canNudgeGroupMessage,
  unreadRecipientUids,
  type NudgeGroupMessageResult,
} from '@cultuvilla/shared/models';

const db = getFirestore();
const handler = 'nudgeGroupMessage';
const BATCH_SIZE = 400;

interface NudgeGroupMessageData {
  orgId?: unknown;
  messageId?: unknown;
}

/** Exported for the handler tests; the callable below is the only production caller. */
export async function runNudgeGroupMessage(
  firestore: Firestore,
  callerUid: string,
  orgId: string,
  messageId: string,
  now: Date,
): Promise<NudgeGroupMessageResult> {
  const [org, caller] = await Promise.all([
    organizationDoc(firestore, orgId).get().then((s) => s.data()),
    organizationMemberDoc(firestore, orgId, callerUid).get().then((s) => s.data()),
  ]);
  if (caller?.role !== 'admin') throw new HttpsError('permission-denied', 'No autorizado.');
  if (!org) throw new HttpsError('not-found', 'El grupo no existe.');

  const messageRef = organizationMessageDoc(firestore, orgId, messageId);
  // The claim (count + time) is transactional, so two admins tapping at once nudge once.
  const { unread, nudgeNumber, title } = await firestore.runTransaction(async (tx) => {
    const message = (await tx.get(messageRef)).data();
    if (!message) throw new HttpsError('not-found', 'El mensaje no existe.');
    if (!canNudgeGroupMessage(message, now)) {
      throw new HttpsError('failed-precondition', 'Ya lo recordaste hace poco. Espera unas horas.');
    }
    const reads = await tx.get(organizationMessageReadsCollection(firestore, orgId, messageId));
    const pending = unreadRecipientUids(message, reads.docs.map((d) => d.id));
    // Everyone has read it: nothing to send, and no reason to start the wait.
    if (pending.length === 0) return { unread: pending, nudgeNumber: message.nudgeCount, title: message.title };
    const n = message.nudgeCount + 1;
    tx.update(messageRef, { nudgeCount: n, lastNudgedAt: now });
    return { unread: pending, nudgeNumber: n, title: message.title };
  });

  for (let start = 0; start < unread.length; start += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const uid of unread.slice(start, start + BATCH_SIZE)) {
      // A fresh id per nudge: an overwrite of the first notification would never push.
      batch.set(
        userNotificationsCollection(firestore, uid).doc(`group_message_${messageId}_nudge${String(nudgeNumber)}`),
        buildNotificationData({
          type: 'group_message',
          title: `${org.name} · ${title}`,
          body: 'Tienes un aviso del grupo sin leer.',
          municipalityId: org.municipalityId,
          entityKind: 'organization',
          entityId: orgId,
          createdAt: now,
        }),
      );
    }
    await batch.commit();
  }

  logger.info('Group message nudged', { handler, orgId, messageId, nudged: unread.length, nudgeNumber });
  return { nudged: unread.length };
}

/**
 * Pushes a group message again to the recipients with the app who have not
 * opened it — never to those who have. At most once every 12 hours per
 * message, so a nudge stays a reminder and not a siren. Admins of the org only.
 */
export const nudgeGroupMessage = onCall<NudgeGroupMessageData, Promise<NudgeGroupMessageResult>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { orgId, messageId } = request.data;
    if (typeof orgId !== 'string' || typeof messageId !== 'string' || !orgId || !messageId) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }
    return runNudgeGroupMessage(db, callerUid, orgId, messageId, new Date());
  },
);
