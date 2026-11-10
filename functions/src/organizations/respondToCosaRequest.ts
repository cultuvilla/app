import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  cosaDoc,
  cosaRequestDoc,
  cosaRequestsCollection,
  organizationMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  cosaDatesOverlap,
  isCosaRequestAction,
  isFinalCosaRequestStatus,
  nextCosaRequestStatus,
  OPEN_COSA_REQUEST_STATUSES,
  type CosaRequestAction,
  type CosaRequestRole,
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
 * the cosa and declines its other open requests. `onCosaRequestWritten` sends
 * the notifications.
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
    // or give themself a cosa — another manager answers.
    const roles: CosaRequestRole[] = [];
    if (req.requesterUid === uid) roles.push('requester');
    else if (isAdmin || (req.ownerUid !== null && req.ownerUid === uid)) roles.push('manager');
    if (roles.length === 0) throw new HttpsError('permission-denied', REASON_MESSAGES['not-your-role']);

    const next = nextCosaRequestStatus(req.cosaKind, req.status, action, roles);
    if (!next.ok) {
      throw new HttpsError(next.reason === 'wrong-state' ? 'failed-precondition' : 'permission-denied', REASON_MESSAGES[next.reason]);
    }

    // A cosa deleted under an open request can still be declined or cancelled,
    // never handed over.
    if (!cosa && (action === 'accept' || action === 'lend' || action === 'give' || action === 'done')) {
      throw new HttpsError('failed-precondition', 'Esa cosa ya no está en la cosateca.');
    }
    if (cosa && action === 'accept' && cosa.status !== 'available') {
      throw new HttpsError('failed-precondition', 'Esa cosa no está disponible ahora.');
    }

    let declineOthers: string[] = [];
    if (cosa && req.cosaKind === 'prestamo' && action === 'accept') {
      const others = await tx.get(
        cosaRequestsCollection(firestore).where('cosaId', '==', req.cosaId).where('status', 'in', ['accepted', 'lent']),
      );
      if (others.docs.some((d) => d.id !== requestId && cosaDatesOverlap(d.data(), req))) {
        throw new HttpsError('failed-precondition', 'Ya está prestada o comprometida en esas fechas.');
      }
    }
    if (cosa && action === 'lend' && cosa.heldBy !== null && cosa.heldBy.requestId !== requestId) {
      throw new HttpsError('failed-precondition', `La tiene ${cosa.heldBy.name} ahora mismo.`);
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
        tx.update(cosaRef, { heldBy: { requestId, uid: req.requesterUid, name: req.requesterName, untilOn: req.untilOn } });
      } else if (action === 'return' && cosa.heldBy?.requestId === requestId) {
        tx.update(cosaRef, { heldBy: null });
      } else if (action === 'give') {
        tx.update(cosaRef, { status: 'given' });
      }
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
