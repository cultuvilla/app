import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  eventDoc,
  eventRegistrationsCollection,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData } from '@cultuvilla/shared/models';
import { selectPromotionGroup } from '../helpers/registerToEventValidation';
import { appendRegistrationEvent } from '../helpers/registrationAudit';
import { RESEND_API_KEY } from '../auth/secret';
import { sendRegistrationEmail } from './sendRegistrationEmail';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';

const db = getFirestore();

/**
 * Promotes the next waitlisted registration when a confirmed one is deleted,
 * and keeps `events/{eventId}.confirmedCount` / `.totalCount` in sync.
 * Watches top-level /events/{eventId}/registrations/{regId}.
 */
export const onRegistrationDeleted = defineDocumentTrigger(
  'onRegistrationDeleted',
  { kind: 'deleted', document: 'events/{eventId}/registrations/{regId}', secrets: [RESEND_API_KEY] },
  async (event) => {
    const { eventId } = event.params;
    // The trigger framework hands us a raw DocumentSnapshot (no converter),
    // so the values here are still Firestore Timestamps — we only need
    // `status`, which is a primitive, so a narrow cast is sufficient.
    const rawDeleted = event.data?.data();
    if (!rawDeleted) return;
    const deletedStatus = (rawDeleted as { status?: string }).status;

    const eventRef = eventDoc(db, eventId);
    const regsCol = eventRegistrationsCollection(db, eventId);

    // eventSnap.data() comes through the converter: typed EventData.
    const eventSnap = await eventRef.get();
    const eventData = eventSnap.data();
    if (!eventData) return;

    let promoted = false;
    const promotedAttendees: { userId: string; name: string; position: number }[] = [];
    // `signupEnabled` false means the event no longer takes sign-ups through
    // the app, and onEventUpdated is deleting the whole roster — promoting a
    // waitlisted seat into that would email someone a place that is being
    // removed in the same sweep (and may already be gone, which `update()`
    // rejects). Counters below still run: they must reach zero.
    if (deletedStatus === 'confirmed' && eventData.maxAttendees && eventData.signupEnabled) {
      // Eventarc delivers at-least-once, so this handler can run twice for the
      // same deletion. Only promote into space that is genuinely free: a
      // redelivery (whose freed seat was already refilled) computes zero free
      // seats and promotes no one, so we never over-fill the event.
      const confirmedNow = await regsCol.where('status', '==', 'confirmed').count().get();
      const freeSeats = eventData.maxAttendees - confirmedNow.data().count;

      if (freeSeats > 0) {
        // Read the whole waitlist rather than just its head: a group is
        // promoted whole or not at all, so the decision needs to see which
        // seats belong together. Waitlists are small (they only exist past a
        // capacity the organizer set), so this stays a cheap query.
        const waitlisted = await regsCol
          .where('status', '==', 'waitlisted')
          .orderBy('position', 'asc')
          .get();

        const chosen = selectPromotionGroup(
          waitlisted.docs.map((d) => ({
            id: d.id,
            position: d.data().position,
            groupId: d.data().groupId,
          })),
          freeSeats,
        );

        const byId = new Map(waitlisted.docs.map((d) => [d.id, d]));
        for (const candidate of chosen) {
          const doc = byId.get(candidate.id);
          if (!doc) continue;
          // Converter-wrapped: typed RegistrationData.
          const nextData = doc.data();
          // update() bypasses the converter, partial shape is accepted.
          await doc.ref.update({ status: 'confirmed' });
          promoted = true;

          // Deterministic id: a promotion is terminal (a confirmed seat is
          // never re-waitlisted), so a redelivered trigger overwrites its own
          // entry rather than appending a phantom second promotion.
          await appendRegistrationEvent(db, eventId, `promoted_${doc.id}`, {
            registrationId: doc.id,
            action: 'waitlist_promoted',
            // Nobody performed this — the queue did. Empty rather than an
            // organizer uid, so the log never implies someone intervened.
            actorUserId: '',
            subjectUserId: nextData.userId,
            personId: nextData.personId,
            name: nextData.name,
            // The status it was promoted TO.
            status: 'confirmed',
            groupId: nextData.groupId,
          });

          // An open seat has no one to tell — its group owner learns of the
          // promotion through their own seat's notification.
          if (!nextData.isOpenSeat) {
            promotedAttendees.push({
              userId: nextData.userId,
              name: nextData.name,
              position: nextData.position,
            });

            // Deterministic notification id (one per user+event) so a
            // redelivered promotion overwrites rather than appending a
            // duplicate. Typed converter ref — set() marshals through the
            // schema, so createdAt is a plain Date (sentinels are rejected).
            await userNotificationsCollection(db, nextData.userId)
              .doc(`waitlist_${eventId}`)
              .set(
                buildNotificationData({
                  type: 'waitlist_promoted',
                  title: '¡Plaza confirmada!',
                  body: `Se ha liberado una plaza en "${eventData.title}" para ${nextData.name}`,
                  eventId,
                  municipalityId: eventData.municipalityId,
                }),
              );
          }
        }
      }
    }

    // Recompute counts from authoritative state. Cheaper than tracking deltas
    // through every branch and self-heals legacy events that never had
    // counters written.
    const [confirmedSnap, totalSnap] = await Promise.all([
      regsCol.where('status', '==', 'confirmed').count().get(),
      regsCol.count().get(),
    ]);
    await eventRef.update({
      confirmedCount: confirmedSnap.data().count,
      totalCount: totalSnap.data().count,
    });

    for (const attendee of promotedAttendees) {
      await sendRegistrationEmail({
        userId: attendee.userId,
        eventId,
        event: eventData,
        attendees: [
          {
            name: attendee.name,
            status: 'confirmed',
            position: attendee.position,
          },
        ],
        confirmedCount: confirmedSnap.data().count,
        kind: 'waitlist_promotion',
      });
    }

    logger.info('Registration deleted handled', {
      handler: 'onRegistrationDeleted',
      eventId,
      deletedStatus,
      promoted,
      promotedCount: promotedAttendees.length,
      confirmedCount: confirmedSnap.data().count,
      totalCount: totalSnap.data().count,
    });
  },
);
