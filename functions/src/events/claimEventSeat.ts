import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
  eventDoc,
  eventRegistrationDoc,
  eventRegistrationsCollection,
  eventRegistrationPrivateDoc,
  eventSeatTokenDoc,
  municipalityMemberDoc,
  personDoc,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData, validateSignupAnswers } from '@cultuvilla/shared/models';
import { isWellFormedSeatToken } from '../helpers/seatToken';
import { writeRegistrationEvent } from '../helpers/registrationAudit';
import { assertMayJoinEvent } from '../helpers/privateEventAccess';
import { RESEND_API_KEY } from '../auth/secret';
import { sendRegistrationEmail } from './sendRegistrationEmail';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

interface ClaimEventSeatData {
  eventId?: string;
  token?: string;
  /** A persona the caller owns — themselves, or someone in their care. */
  personId?: string;
  name?: string;
  phone?: string;
  answers?: Record<string, unknown>;
}

interface ClaimEventSeatResult {
  registrationId: string;
  status: 'confirmed' | 'waitlisted';
  eventId: string;
}

/**
 * Turns a held open seat into the caller's own registration.
 *
 * The seat already exists and already occupies capacity — the group owner
 * booked it when they signed up — so this never touches the waitlist or the
 * event counters. It is a **reassignment**, not a new sign-up, which is why
 * there is no pending state, no expiry sweeper and no third registration
 * status anywhere in the codebase.
 *
 * `userId` moves to the claimer (so the seat now behaves like any registration
 * of theirs — it shows in their list, they can cancel it) while `groupOwnerId`
 * keeps pointing at the person who booked the group. That split is what
 * `cancelRegistration` reads to tell "the group is leaving" from "one guest
 * dropped out".
 *
 * Deliberately NOT required: village membership. Signing up for an event never
 * required it, so claiming a seat at one must not either — `isMember` is simply
 * recomputed for the roster badge.
 */
export const claimEventSeat = defineCallable<ClaimEventSeatData, Promise<ClaimEventSeatResult>>(
  'claimEventSeat',
  { cors: true, secrets: [RESEND_API_KEY] },
  async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const uid = auth.uid;

    const eventId = typeof request.data.eventId === 'string' ? request.data.eventId.trim() : '';
    const token = request.data.token;
    const personId = typeof request.data.personId === 'string' ? request.data.personId.trim() : '';
    const name = typeof request.data.name === 'string' ? request.data.name.trim() : '';
    const phone =
      typeof request.data.phone === 'string' && request.data.phone.trim()
        ? request.data.phone.trim()
        : undefined;

    if (!eventId) throw new HttpsError('invalid-argument', 'eventId requerido.');
    // Shape-checked before it is spent on a read: a malformed token can only
    // ever miss, so there is no reason to pay Firestore for the lookup.
    if (!isWellFormedSeatToken(token)) {
      throw new HttpsError('not-found', 'Esta invitación no es válida.');
    }
    if (!personId) throw new HttpsError('invalid-argument', 'personId requerido.');
    if (!name) throw new HttpsError('invalid-argument', 'name requerido.');

    const committed = await db.runTransaction(async (tx) => {
      const tokenRef = eventSeatTokenDoc(db, eventId, token);
      const [tokenSnap, eventSnap, personSnap] = await Promise.all([
        tx.get(tokenRef),
        tx.get(eventDoc(db, eventId)),
        tx.get(personDoc(db, personId)),
      ]);

      const tokenData = tokenSnap.data();
      if (!tokenData) throw new HttpsError('not-found', 'Esta invitación no es válida.');
      if (tokenData.consumedAt !== null) {
        throw new HttpsError('failed-precondition', 'Esta invitación ya se ha usado.');
      }

      const eventData = eventSnap.data();
      if (!eventData) throw new HttpsError('not-found', 'El evento no existe.');
      if (eventData.status !== 'published') {
        throw new HttpsError('failed-precondition', 'Este evento ya no admite inscripciones.');
      }
      // A seat token is a secret, but a secret that travels: the whole point of
      // an open seat is that the owner forwards the link. On a private event
      // that link must not become a way around the org boundary.
      await assertMayJoinEvent(db, tx, eventData, uid);

      // A persona the caller does not own would let anyone put a third party's
      // name and photo on a world-readable roster — the same boundary the
      // `persons` rules draw with "a persona may claim nobody or its own
      // owner, never a third party".
      const person = personSnap.data();
      if (!person) throw new HttpsError('not-found', 'Esa persona no existe.');
      if (person.createdBy !== uid && person.userId !== uid) {
        throw new HttpsError('permission-denied', 'Esa persona no es tuya.');
      }

      const regRef = eventRegistrationDoc(db, eventId, tokenData.registrationId);
      const regSnap = await tx.get(regRef);
      const reg = regSnap.data();
      if (!reg) throw new HttpsError('not-found', 'Esta plaza ya no existe.');
      if (!reg.isOpenSeat) {
        throw new HttpsError('failed-precondition', 'Esta plaza ya está ocupada.');
      }

      // One person, one seat: without this a claimer could take both halves of
      // a pareja, or take a seat next to a persona they already registered.
      const dupe = await tx.get(
        eventRegistrationsCollection(db, eventId).where('personId', '==', personId),
      );
      if (!dupe.empty) {
        throw new HttpsError('already-exists', 'Esa persona ya está apuntada a este evento.');
      }

      const answersResult = validateSignupAnswers(eventData.signupFields, request.data.answers);
      if (!answersResult.ok) {
        logger.info('Rejected seat-claim answers', {
          handler: 'claimEventSeat',
          eventId,
          uid,
          fieldId: answersResult.fieldId,
          reason: answersResult.reason,
        });
        throw new HttpsError(
          'invalid-argument',
          'Faltan respuestas obligatorias o alguna no es válida.',
        );
      }
      const answers = answersResult.value;

      const memberSnap = await tx.get(municipalityMemberDoc(db, eventData.municipalityId, uid));

      // update() rather than set(): status and position were decided when the
      // group was seated and must survive the claim untouched.
      // withConverter(null) because the typed partial rejects the nullable
      // fields below — the converter models whole documents, not patches.
      tx.update(regRef.withConverter(null), {
        userId: uid,
        personId,
        name,
        isMember: memberSnap.exists,
        photoURL: person.photoURL,
        personUserId: person.userId,
        isPersonPublic: person.isPublic,
        isOpenSeat: false,
      });

      // The claimer answers the event's questions for themselves — that is the
      // whole reason the fields are per-attendee. Overwrites whatever
      // placeholder the group owner's sign-up left behind.
      // The birth date rides along for the same reason it does at sign-up: the
      // roster export reads it from here, and it is PII the world-readable
      // registration doc must never carry.
      const birthday = person.birthday ?? null;
      if (phone || Object.keys(answers).length > 0 || birthday) {
        tx.set(eventRegistrationPrivateDoc(db, eventId, regRef.id), {
          name,
          phone: phone ?? null,
          answers,
          birthday,
        });
      }

      tx.update(tokenRef, { consumedAt: new Date(), consumedBy: uid });

      writeRegistrationEvent(tx, db, eventId, {
        registrationId: regRef.id,
        action: 'seat_claimed',
        actorUserId: uid,
        subjectUserId: uid,
        personId,
        name,
        status: reg.status,
        groupId: reg.groupId,
      });

      // The group owner is accountable for the seat, so they are told who took
      // it. Deterministic id keyed by the seat: a re-delivery or a later
      // re-claim of the same seat overwrites rather than piling up.
      if (tokenData.createdBy !== uid) {
        tx.set(
          userNotificationsCollection(db, tokenData.createdBy).doc(`seat_${regRef.id}`),
          buildNotificationData({
            type: 'seat_claimed',
            title: 'Plaza reclamada',
            body: `${name} ha ocupado tu plaza en "${eventData.title}"`,
            eventId,
            municipalityId: eventData.municipalityId,
          }),
        );
      }

      logger.info('Event seat claimed', {
        handler: 'claimEventSeat',
        eventId,
        uid,
        registrationId: regRef.id,
        groupId: reg.groupId,
        status: reg.status,
      });

      return {
        registrationId: regRef.id,
        status: reg.status,
        position: reg.position,
        event: eventData,
        name,
      };
    });

    // Outside the transaction: Firestore retries the callback on contention,
    // and a send inside it would go out once per retry.
    await sendRegistrationEmail({
      userId: uid,
      eventId,
      event: committed.event,
      attendees: [{ name: committed.name, status: committed.status, position: committed.position }],
      confirmedCount: committed.event.confirmedCount,
      kind: 'registration',
    });

    return {
      registrationId: committed.registrationId,
      status: committed.status,
      eventId,
    };
  },
);
