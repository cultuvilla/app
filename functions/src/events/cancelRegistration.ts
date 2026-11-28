import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
  adminDoc,
  eventDoc,
  eventRegistrationDoc,
  eventRegistrationsCollection,
  eventRegistrationPrivateDoc,
  eventSeatTokenDoc,
  eventSeatTokensCollection,
  municipalityMemberDoc,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildNotificationData,
  buildSeatTokenData,
  OPEN_SEAT_NAME,
} from '@cultuvilla/shared/models';
import type { EventData } from '@cultuvilla/shared';
import type { CancelledEmailAttendee } from '@cultuvilla/shared/email';
import { isWalkInAuthorized } from '../helpers/walkInAuthorization';
import { sendCancellationEmail } from './sendCancellationEmail';
import { resolveCancellation } from '../helpers/cancellationPlan';
import { generateSeatToken } from '../helpers/seatToken';
import { writeRegistrationEvent } from '../helpers/registrationAudit';
import { RESEND_API_KEY } from '../auth/secret';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

interface CancelRegistrationData {
  eventId?: string;
  registrationId?: string;
}

/** One recipient's share of a cancellation: the seats they lost, and whether they did it. */
interface CancellationRecipient {
  userId: string;
  attendees: CancelledEmailAttendee[];
  selfInflicted: boolean;
}

export interface CancelRegistrationResult {
  /** What happened, so the client can word the confirmation honestly. */
  action: 'delete-solo' | 'delete-group' | 'release-seat';
  removedRegistrationIds: string[];
}

export interface CancelRegistrationAsArgs {
  eventId: string;
  registrationId: string;
  /** Whose cancellation this is: the caller, or the seat's holder on their behalf. */
  uid: string;
}

/**
 * The one cancellation: what the callable does for its caller, and what
 * deleting a persona does on the seat holder's behalf. Counters and waitlist
 * promotion follow from the delete, in onRegistrationDeleted.
 */
export async function cancelRegistrationAs({
  eventId,
  registrationId,
  uid,
}: CancelRegistrationAsArgs): Promise<CancelRegistrationResult> {
  const outcome = await db.runTransaction<
    CancelRegistrationResult & { recipients: CancellationRecipient[]; event: EventData | null }
  >(async (tx) => {
    const regRef = eventRegistrationDoc(db, eventId, registrationId);
    const [regSnap, eventSnap] = await Promise.all([tx.get(regRef), tx.get(eventDoc(db, eventId))]);

    const reg = regSnap.data();
    if (!reg) throw new HttpsError('not-found', 'Esta inscripción no existe.');
    const eventData = eventSnap.data();
    if (!eventData) throw new HttpsError('not-found', 'El evento no existe.');

    const [villageMemberSnap, appAdminSnap] = await Promise.all([
      tx.get(municipalityMemberDoc(db, eventData.municipalityId, uid)),
      tx.get(adminDoc(db, uid)),
    ]);
    const isOrganizer = isWalkInAuthorized({
      uid,
      organizerUserIds: eventData.organizerUserIds,
      isVillageAdmin: villageMemberSnap.exists && villageMemberSnap.data()?.role === 'admin',
      isAppAdmin: appAdminSnap.exists,
    });

    const plan = resolveCancellation({
      uid,
      isOrganizer,
      registration: {
        userId: reg.userId,
        groupId: reg.groupId,
        groupOwnerId: reg.groupOwnerId,
      },
    });
    if (!plan) {
      logger.info('Cancellation denied', {
        handler: 'cancelRegistration',
        eventId,
        registrationId,
        uid,
      });
      throw new HttpsError('permission-denied', 'No puedes cancelar esta inscripción.');
    }

    // Every read must precede the first write in a Firestore transaction, so
    // the group's seats and tokens are fetched before anything is deleted.
    const groupSeats =
      plan.action === 'delete-group'
        ? await tx.get(eventRegistrationsCollection(db, eventId).where('groupId', '==', plan.groupId))
        : null;
    const groupTokens =
      plan.action === 'delete-group'
        ? await tx.get(eventSeatTokensCollection(db, eventId).where('groupId', '==', plan.groupId))
        : null;

    if (plan.action === 'release-seat') {
      // The seat stays booked and keeps its status and position — capacity was
      // never freed, so the waitlist must not move. Only the identity on it is
      // wound back to the placeholder.
      // withConverter(null): the typed partial rejects the nullable fields
      // below — the converter models whole documents, not patches.
      tx.update(regRef.withConverter(null), {
        userId: reg.groupOwnerId ?? reg.userId,
        personId: '',
        name: OPEN_SEAT_NAME,
        isMember: false,
        photoURL: null,
        personUserId: null,
        isPersonPublic: true,
        isOpenSeat: true,
      });
      // The guest's phone and answers were theirs, not the next claimer's.
      tx.delete(eventRegistrationPrivateDoc(db, eventId, registrationId));

      const token = generateSeatToken();
      tx.set(
        eventSeatTokenDoc(db, eventId, token),
        buildSeatTokenData({
          registrationId,
          groupId: plan.groupId,
          createdBy: reg.groupOwnerId ?? reg.userId,
        }),
      );

      if (reg.groupOwnerId && reg.groupOwnerId !== uid) {
        tx.set(
          userNotificationsCollection(db, reg.groupOwnerId).doc(`seat_${registrationId}`),
          buildNotificationData({
            type: 'seat_released',
            title: 'Plaza libre otra vez',
            body: `${reg.name} ha dejado tu plaza en "${eventData.title}". Puedes volver a invitar a alguien.`,
            eventId,
            municipalityId: eventData.municipalityId,
          }),
        );
      }

      writeRegistrationEvent(tx, db, eventId, {
        registrationId,
        action: 'seat_released',
        actorUserId: uid,
        subjectUserId: reg.userId,
        personId: reg.personId,
        name: reg.name,
        status: reg.status,
        groupId: plan.groupId,
      });

      logger.info('Group seat released', {
        handler: 'cancelRegistration',
        eventId,
        registrationId,
        uid,
        groupId: plan.groupId,
      });
      // A guest handing a seat back keeps the booking alive, so there is
      // nothing to mourn by email — the owner's notification above is the
      // whole story.
      return { action: plan.action, removedRegistrationIds: [], recipients: [], event: null };
    }

    // delete-solo / delete-group. The onRegistrationDeleted trigger recomputes
    // the event counters and runs waitlist promotion, so neither is touched
    // here — doing both would double-count.
    const doomed = groupSeats ? groupSeats.docs.map((d) => d.ref) : [regRef];
    const doomedData = groupSeats ? groupSeats.docs.map((d) => d.data()) : [reg];
    // The audit entry is the ONLY thing that survives this: the registration
    // and its private answers are hard-deleted, so without a record written in
    // this same transaction an organizer can never see that the attendee was
    // ever on the roster. `group_cancelled` is one entry per lost seat, not one
    // per group — the roster is a list of people, and so is its history.
    const at = new Date();
    doomed.forEach((ref, i) => {
      const seat = doomedData[i];
      tx.delete(ref);
      tx.delete(eventRegistrationPrivateDoc(db, eventId, ref.id));
      writeRegistrationEvent(tx, db, eventId, {
        registrationId: ref.id,
        action:
          plan.action === 'delete-group'
            ? 'group_cancelled'
            : seat.userId === uid
              ? 'cancelled_self'
              : 'removed_by_organizer',
        actorUserId: uid,
        subjectUserId: seat.userId,
        personId: seat.personId,
        name: seat.name,
        status: seat.status,
        groupId: seat.groupId,
        at,
      });
    });
    // Unconsumed links for a group that no longer exists would 404 on claim
    // anyway; deleting them makes the failure immediate and honest.
    for (const tokenDoc of groupTokens?.docs ?? []) {
      tx.delete(tokenDoc.ref);
    }

    // Open seats belong to the owner but name nobody, so listing "Plaza libre"
    // as a lost seat would be noise. Real seats only.
    const lostSeats = (groupSeats?.docs.map((d) => d.data()) ?? [reg]).filter((r) => !r.isOpenSeat);
    const recipients: CancellationRecipient[] = [];
    for (const seat of lostSeats) {
      const existing = recipients.find((r) => r.userId === seat.userId);
      if (existing) {
        existing.attendees.push({ name: seat.name });
        continue;
      }
      recipients.push({
        userId: seat.userId,
        attendees: [{ name: seat.name }],
        selfInflicted: seat.userId === uid,
      });
    }

    for (const recipient of recipients) {
      // Telling people what they themselves just did is noise; the callable
      // already answered them.
      if (recipient.selfInflicted) continue;
      // Deterministic id: one removal from one event is one notification,
      // however many seats it took and however often Eventarc redelivers.
      tx.set(
        userNotificationsCollection(db, recipient.userId).doc(`removed_${eventId}`),
        buildNotificationData({
          type: 'registration_removed',
          title: 'Inscripción cancelada',
          body: `Ya no estás apuntado a "${eventData.title}". Habla con quien organiza el evento si crees que es un error.`,
          eventId,
          municipalityId: eventData.municipalityId,
        }),
      );
    }

    logger.info('Registration cancelled', {
      handler: 'cancelRegistration',
      eventId,
      registrationId,
      uid,
      action: plan.action,
      removedCount: doomed.length,
    });

    return {
      action: plan.action,
      removedRegistrationIds: doomed.map((r) => r.id),
      recipients,
      event: eventData,
    };
  });

  // Deliberately outside the transaction: Firestore retries the callback on
  // contention, and a send inside it would go out once per retry. Failures are
  // swallowed and logged by sendCancellationEmail — a bounced email must not
  // undo a completed cancellation.
  const event = outcome.event;
  if (event) {
    for (const recipient of outcome.recipients) {
      await sendCancellationEmail({
        userId: recipient.userId,
        eventId,
        event,
        attendees: recipient.attendees,
        selfInflicted: recipient.selfInflicted,
      });
    }
  }

  return {
    action: outcome.action,
    removedRegistrationIds: outcome.removedRegistrationIds,
  };
}

/**
 * Removes a registration — the only path that may, since `firestore.rules`
 * denies client deletes on `registrations`.
 *
 * Rules cannot express this. A group is atomic, so cancelling one of its seats
 * must either take every seat with it or leave the group whole; neither is a
 * single-document decision, and Firestore rules can neither read the other
 * seats nor require that a companion delete accompany this one. So the whole
 * operation moved server-side, individual registrations included, rather than
 * leaving a client-writable path that could shrink a group behind the rule's
 * back.
 *
 * See `resolveCancellation` for which of the three outcomes applies.
 */
export const cancelRegistration = defineCallable<
  CancelRegistrationData,
  Promise<CancelRegistrationResult>
>('cancelRegistration', { cors: true, secrets: [RESEND_API_KEY] }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const uid = auth.uid;

  const eventId = typeof request.data.eventId === 'string' ? request.data.eventId.trim() : '';
  const registrationId =
    typeof request.data.registrationId === 'string' ? request.data.registrationId.trim() : '';
  if (!eventId) throw new HttpsError('invalid-argument', 'eventId requerido.');
  if (!registrationId) throw new HttpsError('invalid-argument', 'registrationId requerido.');

  return cancelRegistrationAs({ eventId, registrationId, uid });
});
