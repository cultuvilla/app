import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  eventRegistrationEventsCollection,
  eventRegistrationPrivateDoc,
  eventRegistrationsCollection,
  eventSeatTokensCollection,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData, buildRegistrationEventData } from '@cultuvilla/shared/models';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';

const db = getFirestore();

/**
 * Watches top-level /events/{eventId} docs and notifies all registrants on
 * cancellation or significant edits.
 *
 * Note: Firestore trigger snapshots are NOT converter-wrapped, so
 * `before.data()` / `after.data()` return raw `DocumentData` containing
 * Firestore Timestamps and GeoPoints — NOT the normalized EventData shape
 * the read-side ref factories produce. We deliberately use raw access with
 * narrow casts here; `EventDataSchema.safeParse` would fail because the
 * schema expects Date and {lat,lng}.
 */
export const onEventUpdated = defineDocumentTrigger(
  'onEventUpdated',
  { kind: 'updated', document: 'events/{eventId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const { eventId } = event.params;

    if (!before || !after) return;

    const afterTitle = after['title'] as string | undefined;
    const beforeStatus = before['status'] as string | undefined;
    const afterStatus = after['status'] as string | undefined;
    const municipalityId = (after['municipalityId'] as string | undefined) ?? null;

    if (beforeStatus !== 'cancelled' && afterStatus === 'cancelled') {
      const regs = await eventRegistrationsCollection(db, eventId).get();
      const userIds = new Set(regs.docs.map((r) => r.data().userId));
      const batch = db.batch();
      for (const userId of userIds) {
        // Typed converter ref — batch.set marshals through the schema, so
        // createdAt is a plain Date (FieldValue.serverTimestamp would be
        // rejected by the schema).
        const ref = userNotificationsCollection(db, userId).doc();
        batch.set(
          ref,
          buildNotificationData({
            type: 'event_cancelled',
            title: 'Evento cancelado',
            body: `El evento "${afterTitle ?? ''}" ha sido cancelado`,
            eventId,
            municipalityId,
          }),
        );
      }
      await batch.commit();
    }

    if (
      afterStatus === 'published' && beforeStatus === 'published' &&
      (
        before['title'] !== after['title'] ||
        // startDate is a Firestore Timestamp on the raw snapshot; JSON.stringify
        // serializes to {seconds,nanoseconds} which is comparable shape-wise.
        JSON.stringify(before['startDate']) !== JSON.stringify(after['startDate']) ||
        JSON.stringify(before['location']) !== JSON.stringify(after['location'])
      )
    ) {
      const regs = await eventRegistrationsCollection(db, eventId).get();
      const userIds = new Set(regs.docs.map((r) => r.data().userId));
      const batch = db.batch();
      for (const userId of userIds) {
        const ref = userNotificationsCollection(db, userId).doc();
        batch.set(
          ref,
          buildNotificationData({
            type: 'event_updated',
            title: 'Evento actualizado',
            body: `El evento "${afterTitle ?? ''}" ha sido actualizado`,
            eventId,
            municipalityId,
          }),
        );
      }
      await batch.commit();
    }

    // ── In-app sign-ups turned off on an event that already had some ────────
    // The registrations cannot simply stay: the event now tells everyone it
    // takes no sign-ups through the app, while still showing a roster of
    // people who made one — and those people lose their own cancel button with
    // the flag (it lives on the sign-up FAB, which the detail screen hides),
    // so leaving the rows behind traps them in a list only an organizer can
    // edit. The organizer confirms the count in the form before saving; this
    // makes it true whichever client flipped the flag.
    if (before['signupEnabled'] !== false && after['signupEnabled'] === false) {
      const regs = await eventRegistrationsCollection(db, eventId).get();
      if (!regs.empty) {
        // Unconsumed group-invite links point at seats that no longer exist.
        const tokens = await eventSeatTokensCollection(db, eventId).get();
        const userIds = new Set(regs.docs.map((r) => r.data().userId));

        const writer = db.bulkWriter();
        // The sweep is the largest removal the product can perform, and it
        // hard-deletes every row — so the audit entry written alongside each
        // delete is the organizer's only remaining record of who had signed
        // up. Deterministic id for the same reason as the notification below:
        // a redelivered flip must overwrite, not duplicate.
        const sweptAt = new Date();
        for (const reg of regs.docs) {
          const seat = reg.data();
          void writer.delete(reg.ref);
          void writer.delete(eventRegistrationPrivateDoc(db, eventId, reg.id));
          void writer.set(
            eventRegistrationEventsCollection(db, eventId).doc(`disabled_${reg.id}`),
            buildRegistrationEventData({
              registrationId: reg.id,
              action: 'signups_disabled',
              actorUserId: '',
              subjectUserId: seat.userId,
              personId: seat.personId,
              name: seat.name,
              status: seat.status,
              groupId: seat.groupId,
              at: sweptAt,
            }),
          );
        }
        for (const token of tokens.docs) void writer.delete(token.ref);
        for (const userId of userIds) {
          // Deterministic id: Eventarc delivers at least once, so a redelivered
          // flip must overwrite this notification rather than append a second.
          void writer.set(
            userNotificationsCollection(db, userId).doc(`signups_disabled_${eventId}`),
            buildNotificationData({
              type: 'signups_disabled',
              title: 'Inscripción eliminada',
              body: `El organizador de "${afterTitle ?? ''}" ha desactivado las inscripciones por la app. Habla con quien organiza el evento si quieres asistir.`,
              eventId,
              municipalityId,
            }),
          );
        }
        // BulkWriter rather than a batch: a popular event can hold more
        // registrations than a batch's 500 writes, and each one costs two
        // (the registration and its private doc).
        await writer.close();

        logger.info('Sign-ups disabled, registrations swept', {
          handler: 'onEventUpdated',
          eventId,
          municipalityId,
          removedCount: regs.size,
          notifiedCount: userIds.size,
          removedTokenCount: tokens.size,
        });
      }
    }
  },
);
