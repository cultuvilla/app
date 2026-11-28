import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { eventDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';
import { cancelRegistrationAs } from './cancelRegistration';

const db = getFirestore();

/**
 * A deleted persona gives up its seats on events still to come, the way its
 * holder cancelling them would: through `cancelRegistrationAs`, so the seat
 * frees, the waitlist moves and a group seat follows the group rules. Left
 * alone, the roster kept a seat for someone who no longer exists and the
 * waitlist never moved.
 *
 * Past events keep theirs: a roster records who came, and the registration is
 * a point-in-time copy that does not need the person doc to render.
 *
 * The cancellation runs as the seat's holder (`registration.userId`), not as
 * whoever deleted the persona — the holder is the one who may cancel it, and a
 * seat claimed by someone else's persona must hand back only that seat.
 *
 * Called from syncPersonDenormalization's delete branch rather than from a
 * trigger of its own, so a persona delete costs no extra deployed function.
 */
export async function releaseDeletedPersonSeats(personId: string, handler: string): Promise<void> {
  // Raw refs: only the path, holder and event are needed, and a seat whose
  // stored shape no longer parses must still be cancelled.
  const seats = await db.collectionGroup('registrations').where('personId', '==', personId).get();
  if (seats.empty) return;
  const now = Date.now();
  let cancelled = 0;
  let past = 0;

  for (const seat of seats.docs) {
    const eventId = seat.ref.parent.parent?.id;
    const holder: unknown = seat.get('userId');
    if (!eventId || typeof holder !== 'string' || !holder) continue;

    const eventData = (await eventDoc(db, eventId).get()).data();
    if (!eventData) continue;
    if (eventData.endBoundary.getTime() <= now) {
      past += 1;
      continue;
    }

    try {
      await cancelRegistrationAs({ eventId, registrationId: seat.id, uid: holder });
      cancelled += 1;
    } catch (err) {
      // Gone already: an earlier seat's group cancellation took it, the
      // account cascade deleted it, or this is a redelivery.
      if (err instanceof HttpsError && firebaseErrorCode(err) === 'not-found') continue;
      throw err;
    }
  }

  logger.info('Deleted persona released its upcoming seats', {
    handler,
    personId,
    found: seats.size,
    cancelled,
    past,
  });
}
