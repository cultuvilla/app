import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  eventRegistrationsCollection,
  eventsCollection,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData, EVENT_TZ } from '@cultuvilla/shared/models';
import { formatDate } from '@cultuvilla/shared/utils';
import { sendReservaReminders } from '../organizations/sendReservaReminders';

const db = getFirestore();

const HOUR_MS = 60 * 60 * 1000;
/** How far ahead the nudge goes out. */
export const REMINDER_LEAD_HOURS = 24;

/**
 * The day-before nudge for events you hold a seat at.
 *
 * Runs hourly and looks at a ONE-HOUR window 24 hours out, so each event falls
 * into exactly one run and the query stays a narrow range scan instead of
 * "every future event, filtered in memory". The deterministic notification id
 * is the real guard though: a retried run, an overlapping schedule, or a
 * widened window can all reissue the same event, and every one of them
 * overwrites the same doc rather than adding a second buzz.
 *
 * Waitlisted people are deliberately skipped — they have no seat to be
 * reminded of, and telling them to show up tomorrow would be wrong.
 *
 * The same hourly run sends the cosateca's booking reminders, rather than a
 * second scheduler; a failure there is logged and never stops these.
 */
export const sendEventReminders = onSchedule('every 1 hours', async () => {
  const now = new Date();
  try {
    const reservas = await sendReservaReminders(db, now);
    if (reservas > 0) logger.info('Reserva reminders sent', { handler: 'sendEventReminders', reservas });
  } catch (err) {
    logger.error('Reserva reminders failed', { handler: 'sendEventReminders', error: err instanceof Error ? err.message : String(err) });
  }

  const windowStart = new Date(now.getTime() + (REMINDER_LEAD_HOURS - 1) * HOUR_MS);
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_HOURS * HOUR_MS);

  const events = await eventsCollection(db)
    .where('status', '==', 'published')
    .where('startDate', '>=', Timestamp.fromDate(windowStart))
    .where('startDate', '<', Timestamp.fromDate(windowEnd))
    .get();

  if (events.empty) return;

  let notified = 0;

  for (const eventSnap of events.docs) {
    const event = eventSnap.data();
    // Only the account ids are needed; registrations also carry attendee names.
    const regs = await eventRegistrationsCollection(db, eventSnap.id)
      .withConverter(null)
      .where('status', '==', 'confirmed')
      .select('userId')
      .get();
    if (regs.empty) continue;

    // One person can hold several seats (their family). One reminder each.
    // Walk-ins have no account, so an empty userId is skipped.
    const userIds = new Set<string>();
    for (const r of regs.docs) {
      const uid: unknown = r.get('userId');
      if (typeof uid === 'string' && uid.length > 0) userIds.add(uid);
    }

    const when = formatDate(event.startDate, 'short', EVENT_TZ);
    const writer = db.bulkWriter();
    for (const userId of userIds) {
      void writer.set(
        userNotificationsCollection(db, userId).doc(`event_reminder_${eventSnap.id}`),
        buildNotificationData({
          type: 'event_reminder',
          title: 'Mañana tienes un evento',
          body: `"${event.title}" es el ${when}.`,
          eventId: eventSnap.id,
          municipalityId: event.municipalityId,
        }),
      );
      notified += 1;
    }
    await writer.close();
  }

  logger.info('Event reminders sent', {
    handler: 'sendEventReminders',
    eventCount: events.size,
    notifiedCount: notified,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });
});
