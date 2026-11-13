import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  cosaDoc,
  cosaRequestDoc,
  cosaRequestsCollection,
  cosaSlotDoc,
  cosaSlotsCollection,
  municipalityMemberDoc,
  organizationDoc,
  organizationMemberDoc,
  publicProfileDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildCosaRequestData,
  checkReservaSlot,
  isActiveReserva,
  MAX_COSA_REQUEST_MESSAGE,
  rangesOverlap,
  type CosaRequestStatus,
} from '@cultuvilla/shared/models';

const db = getFirestore();

interface BookReservaSlotData {
  cosaId?: unknown;
  startAt?: unknown;
  message?: unknown;
}

const SLOT_REASONS = {
  'not-a-slot': 'Esa hora no se puede reservar.',
  past: 'Esa hora ya ha pasado.',
  'beyond-horizon': 'Todavía no se puede reservar ese día.',
} as const;

/**
 * Book a slot of a reserva (the pádel court). Every booking goes through here,
 * never a client write: the slot must be one the cosa's grid produces, within
 * its horizon, and the person must stay under `maxActiveReservations` — a count
 * over their other bookings that no rule can hold.
 *
 * The slot's lock, `cosas/{cosaId}/slots/{startISO}`, is claimed in the same
 * transaction, so two people tapping the same slot leave exactly one booking.
 * The lock's key alone is not enough: a manager changing the hours or the slot
 * length moves the grid, and a new slot may start inside a booking made under
 * the old one — so any live lock overlapping the slot refuses it too;
 * the booking itself is an ordinary `cosaRequests` doc, private to its parties.
 * A free slot books as `accepted`, or `pending` when the cosa asks for approval
 * (then `onCosaRequestWritten` tells its managers).
 */
export async function applyBookReservaSlot(
  firestore: Firestore,
  uid: string,
  args: { cosaId: string; startAt: Date; message: string | null },
  now: Date,
): Promise<{ requestId: string; status: CosaRequestStatus }> {
  const requestRef = cosaRequestsCollection(firestore).doc();
  return firestore.runTransaction(async (tx) => {
    const cosaSnap = await tx.get(cosaDoc(firestore, args.cosaId));
    const cosa = cosaSnap.data();
    if (!cosa || cosa.kind !== 'reserva' || !cosa.reserva) throw new HttpsError('not-found', 'Eso no se reserva por horas.');
    const check = checkReservaSlot(cosa.reserva, args.startAt, now);
    if (!check.ok) throw new HttpsError('failed-precondition', SLOT_REASONS[check.reason]);
    const { slot } = check;

    const lockRef = cosaSlotDoc(firestore, args.cosaId, slot.key);
    const [org, member, villageMember, profile, lock, mine, later] = await Promise.all([
      tx.get(organizationDoc(firestore, cosa.orgId)),
      tx.get(organizationMemberDoc(firestore, cosa.orgId, uid)),
      // Only existence and the name are read: unconverted, so neither doc's full shape is needed.
      tx.get(municipalityMemberDoc(firestore, cosa.municipalityId, uid).withConverter(null)),
      tx.get(publicProfileDoc(firestore, uid).withConverter(null)),
      tx.get(lockRef),
      tx.get(cosaRequestsCollection(firestore).where('cosaId', '==', args.cosaId).where('requesterUid', '==', uid)),
      // Every lock still running when this slot starts; those starting after it ends are filtered below.
      tx.get(cosaSlotsCollection(firestore, args.cosaId).where('endAt', '>', slot.startAt)),
    ]);
    const orgData = org.data();
    const canSee = member.exists || (cosa.audience === 'pueblo' && villageMember.exists);
    if (!orgData || orgData.status !== 'approved' || !orgData.cosateca.enabled || !canSee) {
      throw new HttpsError('permission-denied', 'No puedes reservar esto.');
    }
    if (cosa.status !== 'available') throw new HttpsError('failed-precondition', 'Ahora mismo no se puede reservar.');
    if (cosa.ownerUid === uid) throw new HttpsError('failed-precondition', 'Es tuyo: no hace falta reservarlo.');
    if (lock.exists || later.docs.some((d) => rangesOverlap(d.data(), slot))) {
      throw new HttpsError('already-exists', 'Esa hora ya está reservada.');
    }
    const active = mine.docs.filter((d) => isActiveReserva(d.data(), now)).length;
    if (active >= cosa.reserva.maxActiveReservations) {
      throw new HttpsError(
        'resource-exhausted',
        cosa.reserva.maxActiveReservations === 1
          ? 'Ya tienes una reserva pendiente de esto.'
          : `Ya tienes ${String(active)} reservas pendientes de esto, el máximo.`,
      );
    }

    const status = cosa.reserva.requiresApproval ? 'pending' : 'accepted';
    const data = buildCosaRequestData({
      municipalityId: cosa.municipalityId,
      orgId: cosa.orgId,
      cosaId: args.cosaId,
      cosaTitle: cosa.title,
      cosaKind: 'reserva',
      ownerUid: cosa.ownerUid,
      requesterUid: uid,
      requesterName: typeof profile.get('displayName') === 'string' ? (profile.get('displayName') as string) : '',
      message: args.message,
      fromOn: slot.day,
      untilOn: slot.day,
      startAt: slot.startAt,
      endAt: slot.endAt,
      status,
      createdAt: now,
    });
    tx.set(cosaRequestDoc(firestore, requestRef.id), status === 'accepted' ? { ...data, respondedAt: now } : data);
    tx.set(lockRef, { requestId: requestRef.id, startAt: slot.startAt, endAt: slot.endAt, status });
    return { requestId: requestRef.id, status };
  });
}

export const bookReservaSlot = onCall<BookReservaSlotData, Promise<{ requestId: string; status: CosaRequestStatus }>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'bookReservaSlot';
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { cosaId, startAt, message } = request.data;
    const start = typeof startAt === 'string' ? new Date(startAt) : null;
    if (
      typeof cosaId !== 'string' || !cosaId || !start || Number.isNaN(start.getTime())
      || (message !== null && message !== undefined && (typeof message !== 'string' || message.length > MAX_COSA_REQUEST_MESSAGE))
    ) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }
    const text = typeof message === 'string' && message.trim() ? message.trim() : null;
    const result = await applyBookReservaSlot(db, uid, { cosaId, startAt: start, message: text }, new Date());
    logger.info('Reserva booked', { handler, cosaId, requestId: result.requestId, status: result.status });
    return result;
  },
);
