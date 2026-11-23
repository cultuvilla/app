import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { cosaDoc, cosaRequestsCollection, cosaSlotDoc, organizationMemberDoc } from '@cultuvilla/shared/firebase/refs/admin';
import {
  addedBlackouts,
  DayKeySchema,
  MAX_RESERVA_BLACKOUTS,
  reservaSlotKey,
} from '@cultuvilla/shared/models';

const db = getFirestore();

interface SetReservaBlackoutsData {
  cosaId?: unknown;
  blackouts?: unknown;
}

/**
 * A reserva's manager closes days (a fiesta, a flooded court). Callable rather
 * than a client edit because closing a day must also cancel the bookings on it
 * — a blackout that silently strands a booking is worse than none. Each one is
 * declined in the same transaction and its slot freed; `onCosaRequestWritten`
 * tells its booker.
 */
export async function applyReservaBlackouts(
  firestore: Firestore,
  uid: string,
  cosaId: string,
  blackouts: string[],
  now: Date,
): Promise<{ cancelled: number }> {
  return firestore.runTransaction(async (tx) => {
    const cosaSnap = await tx.get(cosaDoc(firestore, cosaId));
    const cosa = cosaSnap.data();
    if (!cosa || cosa.kind !== 'reserva' || !cosa.reserva) throw new HttpsError('not-found', 'Eso no se reserva por horas.');
    const member = await tx.get(organizationMemberDoc(firestore, cosa.orgId, uid));
    const isManager = (cosa.ownerUid !== null && cosa.ownerUid === uid) || member.data()?.role === 'admin';
    if (!isManager) throw new HttpsError('permission-denied', 'No puedes cerrar días de esto.');

    const days = [...new Set(blackouts)].sort();
    const closing = addedBlackouts(cosa.reserva.blackouts, days);
    const open = closing.length === 0
      ? []
      : (await tx.get(cosaRequestsCollection(firestore).where('cosaId', '==', cosaId).where('status', 'in', ['pending', 'accepted']))).docs
          .filter((d) => {
            const req = d.data();
            return req.startAt !== null && req.fromOn !== null && closing.includes(req.fromOn) && req.startAt.getTime() > now.getTime();
          });

    tx.update(cosaSnap.ref.withConverter(null), { 'reserva.blackouts': days, updatedAt: now });
    for (const d of open) {
      const req = d.data();
      tx.update(d.ref.withConverter(null), { status: 'declined', respondedAt: now, closedAt: now });
      if (req.startAt) tx.delete(cosaSlotDoc(firestore, cosaId, reservaSlotKey(req.startAt)));
    }
    return { cancelled: open.length };
  });
}

export const setReservaBlackouts = onCall<SetReservaBlackoutsData, Promise<{ cancelled: number }>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'setReservaBlackouts';
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { cosaId, blackouts } = request.data;
    if (
      typeof cosaId !== 'string' || !cosaId || !Array.isArray(blackouts) || blackouts.length > MAX_RESERVA_BLACKOUTS
      || !blackouts.every((d) => DayKeySchema.safeParse(d).success)
    ) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }
    const result = await applyReservaBlackouts(db, uid, cosaId, blackouts as string[], new Date());
    logger.info('Reserva blackouts set', { handler, cosaId, days: blackouts.length, cancelled: result.cancelled });
    return result;
  },
);
