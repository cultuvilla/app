import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { wrappedId } from '@cultuvilla/shared/models';
import {
  municipalitiesCollection,
  villageWrappedCollection,
  villageWrappedDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { wrappedReminderYear } from './wrappedWindows';
import { announceWrappedPublished, remindVillageAdmins } from './wrappedNotifications';

const db = getFirestore();

/**
 * The Wrapped lifecycle, once an hour.
 *
 * Two independent passes:
 *  1. the month after a village's last fiestas, its admins are reminded to
 *     create the year's Wrapped — unless it already exists. The job cannot
 *     build it itself: a fiesta block only knows its month, and the days are
 *     the admin's to pick;
 *  2. a draft whose grace period expired publishes itself.
 *
 * `autoPublishAt` is a stored timestamp rather than elapsed-time arithmetic, so
 * a missed run delays publication instead of skipping it.
 */
export const runVillageWrappedLifecycle = onSchedule(
  { schedule: 'every 1 hours', timeZone: 'Europe/Madrid', timeoutSeconds: 540 },
  async () => {
    const handler = 'runVillageWrappedLifecycle';
    const now = new Date();

    const villages = await municipalitiesCollection(db).where('communityActive', '==', true).get();
    let reminded = 0;
    for (const snap of villages.docs) {
      const year = wrappedReminderYear(snap.data().community?.fiestas ?? [], now);
      if (year === null) continue;
      try {
        const id = wrappedId(snap.id, year);
        if ((await villageWrappedDoc(db, id).get()).exists) continue;
        reminded += await remindVillageAdmins(db, snap.id, snap.data().name, year, id);
      } catch (error) {
        // One village's bad data must not stop every other village's reminder.
        logger.error('village wrapped reminder failed', { handler, municipalityId: snap.id, year, error: String(error) });
      }
    }

    const due = await villageWrappedCollection(db)
      .where('status', '==', 'draft')
      .where('autoPublishAt', '<=', now)
      .get();
    await Promise.all(
      due.docs.map(async (d) => {
        await d.ref.set({ ...d.data(), status: 'published', autoPublishAt: null });
        try {
          await announceWrappedPublished(db, d.data(), d.id);
        } catch (error) {
          // The Wrapped is out either way; a failed fan-out only costs the
          // members their heads-up, and must not fail the whole pass.
          logger.error('village wrapped announcement failed', { handler, wrappedId: d.id, error: String(error) });
        }
      }),
    );

    logger.info('village wrapped lifecycle ran', {
      handler,
      villagesScanned: villages.size,
      reminded,
      autoPublished: due.size,
    });
  },
);
