import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  cosaDoc,
  cosaRequestDoc,
  cosaRequestsCollection,
  cosaSlotDoc,
  organizationMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  cosaDatesOverlap,
  cosaHasPlace,
  cosaRequestFlow,
  cosaRequestRoles,
  isCosaRequestAction,
  isFinalCosaRequestStatus,
  nextCosaRequestStatus,
  OPEN_COSA_REQUEST_STATUSES,
  reservaSlotKey,
  type CosaRequestAction,
  type CosaRequestStatus,
} from '@cultuvilla/shared/models';

const db = getFirestore();

interface RespondToCosaRequestData {
  requestId?: unknown;
  action?: unknown;
}

const REASON_MESSAGES = {
  'not-allowed': 'Esa acción no existe para este tipo de cosa.',
  'not-your-role': 'No puedes hacer eso con esta solicitud.',
  'wrong-state': 'La solicitud ya no está en ese punto.',
} as const;

/**
 * One move of a cosateca request, in a transaction: the transition table
 * (cosatecaLogic.ts), who may make it, and what it does to the cosa.
 *
 * Callable because the checks span documents a rule cannot hold together:
 * accepting a loan must not overlap another accepted or lent one of the same
 * cosa; lending and returning keep the cosa's `heldBy`; giving a regalo closes
 * the cosa and declines its other open requests; handing a shared cosa on
 * makes the requester its holder, closes the previous holder's request as
 * `passed` and points its other open requests at the new holder; its holder
 * leaving it back in its place frees it and hands those requests back to the
 * group's admins; answering a reserva booking
 * keeps its slot's lock (`cosas/{cosaId}/slots`) — accepted, or freed.
 * `onCosaRequestWritten` sends the notifications.
 */
export async function applyCosaRequestAction(
  firestore: Firestore,
  uid: string,
  requestId: string,
  action: CosaRequestAction,
  now: Date,
): Promise<CosaRequestStatus> {
  return firestore.runTransaction(async (tx) => {
    const reqSnap = await tx.get(cosaRequestDoc(firestore, requestId));
    const req = reqSnap.data();
    if (!req) throw new HttpsError('not-found', 'Esa solicitud no existe.');

    const [cosaSnap, member] = await Promise.all([
      tx.get(cosaDoc(firestore, req.cosaId)),
      tx.get(organizationMemberDoc(firestore, req.orgId, uid)),
    ]);
    const cosa = cosaSnap.data() ?? null;
    const isAdmin = member.data()?.role === 'admin';
    // Whoever asked is only ever the requester: an admin must not accept, lend
    // or give themself a cosa — another manager answers. A shared cosa
    // someone holds is answered by its holder, not the group.
    const roles = cosaRequestRoles(req, { uid, isGroupAdmin: isAdmin });
    if (roles.length === 0) throw new HttpsError('permission-denied', REASON_MESSAGES['not-your-role']);

    const flow = cosaRequestFlow(req.cosaKind, req.ownerUid);
    const next = nextCosaRequestStatus(req.cosaKind, req.status, action, roles, req.ownerUid);
    if (!next.ok) {
      throw new HttpsError(next.reason === 'wrong-state' ? 'failed-precondition' : 'permission-denied', REASON_MESSAGES[next.reason]);
    }

    // A cosa deleted under an open request can still be declined or cancelled,
    // never handed over.
    if (!cosa && (action === 'accept' || action === 'lend' || action === 'give' || action === 'done')) {
      throw new HttpsError('failed-precondition', 'Esa cosa ya no está en la cosateca.');
    }
    // Leaving a shared cosa back in its place: only where it has one, and only
    // while this request's requester is the one holding it.
    if (flow === 'shared' && action === 'return') {
      if (!cosa || cosa.heldBy?.requestId !== requestId) {
        throw new HttpsError('failed-precondition', 'Ya no la tienes tú.');
      }
      if (!cosaHasPlace(cosa)) {
        throw new HttpsError('failed-precondition', 'No tiene un sitio donde dejarla: pásasela a quien la pida.');
      }
    }
    if (cosa && action === 'accept' && cosa.status !== 'available') {
      throw new HttpsError('failed-precondition', 'Esa cosa no está disponible ahora.');
    }

    if (req.cosaKind === 'reserva' && req.startAt !== null && req.startAt.getTime() <= now.getTime()) {
      throw new HttpsError('failed-precondition', 'Esa reserva ya ha pasado.');
    }
    const lockRef = req.cosaKind === 'reserva' && req.startAt !== null ? cosaSlotDoc(firestore, req.cosaId, reservaSlotKey(req.startAt)) : null;
    const lock = lockRef ? await tx.get(lockRef) : null;
    const ownsLock = lock?.data()?.requestId === requestId;

    let declineOthers: string[] = [];
    // A shared cosa is out with someone nearly all the time: the next in line
    // is the one accepted request, whatever the holder is doing.
    if (cosa && flow === 'shared' && action === 'accept') {
      const others = await tx.get(
        cosaRequestsCollection(firestore).where('cosaId', '==', req.cosaId).where('status', '==', 'accepted'),
      );
      if (others.docs.some((d) => d.id !== requestId)) {
        throw new HttpsError('failed-precondition', 'Ya hay otra solicitud aceptada: primero tiene que pasar a esa persona.');
      }
    }
    if (cosa && flow === 'prestamo' && action === 'accept') {
      const others = await tx.get(
        cosaRequestsCollection(firestore).where('cosaId', '==', req.cosaId).where('status', 'in', ['accepted', 'lent']),
      );
      if (others.docs.some((d) => d.id !== requestId && cosaDatesOverlap(d.data(), req))) {
        throw new HttpsError('failed-precondition', 'Ya está prestada o comprometida en esas fechas.');
      }
    }
    if (cosa && flow !== 'shared' && action === 'lend' && cosa.heldBy !== null && cosa.heldBy.requestId !== requestId) {
      throw new HttpsError('failed-precondition', `La tiene ${cosa.heldBy.name} ahora mismo.`);
    }
    // Handing a shared cosa on: the requests still open on it now go to the
    // new holder, and any of theirs is moot — they have it.
    let handover: { passed: string | null; repoint: string[]; cancel: string[] } | null = null;
    if (cosa && flow === 'shared' && action === 'lend') {
      const open = await tx.get(
        cosaRequestsCollection(firestore).where('cosaId', '==', req.cosaId).where('status', 'in', ['pending', 'accepted']),
      );
      const rest = open.docs.filter((d) => d.id !== requestId);
      const previous = cosa.heldBy !== null && cosa.heldBy.requestId !== requestId ? cosa.heldBy.requestId : null;
      // Its request may be gone with its requester's account: close it only if it is still there.
      const previousExists = previous !== null && (await tx.get(cosaRequestDoc(firestore, previous))).exists;
      handover = {
        passed: previousExists ? previous : null,
        repoint: rest.filter((d) => d.data().requesterUid !== req.requesterUid).map((d) => d.id),
        cancel: rest.filter((d) => d.data().requesterUid === req.requesterUid).map((d) => d.id),
      };
    }
    // Left in its place: nobody holds it, so the group's admins answer what waits.
    let backToGroup: string[] = [];
    if (cosa && flow === 'shared' && action === 'return') {
      const open = await tx.get(
        cosaRequestsCollection(firestore).where('cosaId', '==', req.cosaId).where('status', 'in', ['pending', 'accepted']),
      );
      backToGroup = open.docs.filter((d) => d.data().holderUid !== null).map((d) => d.id);
    }
    if (cosa && req.cosaKind === 'regalo' && action === 'give') {
      const open = await tx.get(
        cosaRequestsCollection(firestore).where('cosaId', '==', req.cosaId).where('status', 'in', [...OPEN_COSA_REQUEST_STATUSES]),
      );
      // A request out on loan is never declined: it would strand the loan.
      declineOthers = open.docs.filter((d) => d.id !== requestId && d.data().status !== 'lent').map((d) => d.id);
    }

    // Unconverted: partial updates of function-owned fields.
    const patch: { status: CosaRequestStatus; respondedAt?: Date; closedAt?: Date } = { status: next.to };
    if (action === 'accept' || action === 'decline') patch.respondedAt = req.respondedAt ?? now;
    if (isFinalCosaRequestStatus(next.to)) patch.closedAt = now;
    tx.update(reqSnap.ref.withConverter(null), patch);

    if (cosa) {
      const cosaRef = cosaSnap.ref.withConverter(null);
      if (action === 'lend') {
        tx.update(cosaRef, {
          heldBy: { requestId, uid: req.requesterUid, name: req.requesterName, untilOn: req.untilOn, since: now },
        });
      } else if (action === 'return' && cosa.heldBy?.requestId === requestId) {
        tx.update(cosaRef, { heldBy: null });
      } else if (action === 'give') {
        tx.update(cosaRef, { status: 'given' });
      }
    }
    if (lockRef && ownsLock) {
      if (next.to === 'accepted') tx.update(lockRef.withConverter(null), { status: 'accepted' });
      else if (isFinalCosaRequestStatus(next.to)) tx.delete(lockRef);
    }
    if (handover) {
      if (handover.passed) {
        tx.update(cosaRequestDoc(firestore, handover.passed).withConverter(null), { status: 'passed', closedAt: now });
      }
      for (const id of handover.repoint) {
        tx.update(cosaRequestDoc(firestore, id).withConverter(null), { holderUid: req.requesterUid });
      }
      for (const id of handover.cancel) {
        tx.update(cosaRequestDoc(firestore, id).withConverter(null), { status: 'cancelled', closedAt: now });
      }
    }
    for (const id of backToGroup) {
      tx.update(cosaRequestDoc(firestore, id).withConverter(null), { holderUid: null });
    }
    for (const id of declineOthers) {
      tx.update(cosaRequestDoc(firestore, id).withConverter(null), { status: 'declined', respondedAt: now, closedAt: now });
    }
    return next.to;
  });
}

export const respondToCosaRequest = onCall<RespondToCosaRequestData, Promise<{ status: CosaRequestStatus }>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'respondToCosaRequest';
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { requestId, action } = request.data;
    if (typeof requestId !== 'string' || !requestId || !isCosaRequestAction(action)) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }
    const status = await applyCosaRequestAction(db, uid, requestId, action, new Date());
    logger.info('Cosa request answered', { handler, requestId, action, status });
    return { status };
  },
);
