import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { eventsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { startOfMadridDay } from '@cultuvilla/shared/models';
import { defineSchedule } from '../shared/define/defineSchedule';
import { isNotFound } from '../shared/notFound';

const db = getFirestore();

// An event is over once its last Madrid day is (isStartDayOver on endBoundary),
// i.e. exactly when endBoundary < start of today in Madrid — so the query reads
// only the expired events, never the catalogue of upcoming ones. Served by the
// `events (status, endBoundary)` index.
export const completeExpiredEvents = defineSchedule('completeExpiredEvents', { schedule: 'every 1 hours' }, async () => {
  const cutoff = startOfMadridDay(new Date());
  const expired = await eventsCollection(db)
    .where('status', '==', 'published')
    .where('endBoundary', '<', Timestamp.fromDate(cutoff))
    .get();
  if (expired.empty) return;

  const writer = db.bulkWriter();
  let failed = 0;
  let deleted = 0;
  writer.onWriteError((err) => {
    // Deleted since the query: nothing left to complete, and not a failure.
    if (isNotFound(err)) {
      deleted += 1;
      return false;
    }
    if (err.failedAttempts < 3) return true;
    failed += 1;
    logger.warn('Could not complete an expired event', {
      handler: 'completeExpiredEvents',
      eventId: err.documentRef.id,
      code: err.code,
    });
    return false;
  });
  for (const event of expired.docs) {
    // A write that exhausts its retries is counted and logged in onWriteError;
    // the next hourly run picks the event up again.
    writer
      .update(event.ref, { status: 'completed', updatedAt: FieldValue.serverTimestamp() })
      .catch(() => undefined);
  }
  await writer.close();

  logger.info('Completed expired events', {
    handler: 'completeExpiredEvents',
    cutoff: cutoff.toISOString(),
    completedCount: expired.size - failed - deleted,
    failedCount: failed,
    deletedCount: deleted,
  });
});
