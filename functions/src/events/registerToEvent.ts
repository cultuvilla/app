import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
  eventDoc,
  eventRegistrationsCollection,
  eventRegistrationPrivateDoc,
  eventSeatTokenDoc,
  municipalityMemberDoc,
  personDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import type { PersonData, RegistrationData, SignupAnswers } from '@cultuvilla/shared/models';
import { validateSignupAnswers, buildSeatTokenData, OPEN_SEAT_NAME } from '@cultuvilla/shared/models';
import {
  computeGroupStatuses,
  validateRegisterInput,
  type RegisterToEventData,
} from '../helpers/registerToEventValidation';
import { generateSeatToken } from '../helpers/seatToken';
import { writeRegistrationEvent } from '../helpers/registrationAudit';
import { assertMayJoinEvent } from '../helpers/privateEventAccess';
import { RESEND_API_KEY } from '../auth/secret';
import { sendRegistrationEmail } from './sendRegistrationEmail';
import type { RegistrationEmailAttendee } from '@cultuvilla/shared/email';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

type PersonSnapshot = { id: string; data: () => PersonData | undefined };

function tryReadPerson(snap: PersonSnapshot): PersonData | null {
  try {
    return snap.data() ?? null;
  } catch (err) {
    logger.warn('Person doc failed to parse; roster row degraded', {
      handler: 'registerToEvent',
      personId: snap.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

interface RegistrationSummary {
  id: string;
  status: 'confirmed' | 'waitlisted';
  position: number;
  isMember: boolean;
}

/** One held-but-unfilled seat plus the secret that lets a friend take it. */
interface OpenSeatSummary {
  registrationId: string;
  token: string;
}

interface RegisterToEventResult {
  registrations: RegistrationSummary[];
  openSeats: OpenSeatSummary[];
}

export const registerToEvent = defineCallable<RegisterToEventData, Promise<RegisterToEventResult>>(
  'registerToEvent',
  { cors: true, secrets: [RESEND_API_KEY] },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const { eventId, registrants, openSeats } = validateRegisterInput(request.data);
    const userId = auth.uid;

    const eventRef = eventDoc(db, eventId);
    const regsCol = eventRegistrationsCollection(db, eventId);

    const committed = await db.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (!eventSnap.exists) {
        throw new HttpsError('not-found', 'El evento no existe.');
      }
      // Converter-wrapped: typed EventData.
      const eventData = eventSnap.data();
      if (!eventData) {
        throw new HttpsError('not-found', 'El evento no existe.');
      }
      // Events can opt out of in-app sign-ups entirely (signupEnabled false):
      // entrada libre, or a list kept off-app. The FAB is hidden client-side;
      // this is the enforcement, since registrations are callable-only.
      if (!eventData.signupEnabled) {
        throw new HttpsError('failed-precondition', 'Este evento no admite inscripciones por la app.');
      }
      // Rules hide a private event from outsiders, but this path is Admin SDK
      // and bypasses them: without this check the event id alone would let a
      // non-member sign up to an event they cannot see.
      await assertMayJoinEvent(db, tx, eventData, userId);
      const maxAttendees = eventData.maxAttendees;
      const municipalityId = eventData.municipalityId;
      if (!municipalityId) {
        throw new HttpsError('failed-precondition', 'El evento no tiene pueblo asociado.');
      }

      // One group per call. A pareja event asks for exactly `signupGroupSize`
      // seats, each either a persona the caller owns or an open seat someone
      // will claim; a caller wanting two parejas registers twice. Keeping a
      // call to a single group is what lets the seating below be one atomic
      // fits-or-waits decision instead of a packing problem.
      const groupSize = eventData.signupGroupSize;
      const seatCount = registrants.length + openSeats;
      if (groupSize > 1) {
        if (seatCount !== groupSize) {
          throw new HttpsError(
            'invalid-argument',
            `Este evento requiere grupos de ${String(groupSize)} personas.`,
          );
        }
      } else if (openSeats > 0) {
        throw new HttpsError(
          'failed-precondition',
          'Este evento no admite plazas por invitación.',
        );
      }
      // Null on an individual event, so an ordinary registration is written
      // exactly as before and nothing downstream sees a group.
      const groupId = groupSize > 1 ? regsCol.doc().id : null;

      const [confirmedSnap, totalSnap, memberSnap, personSnaps] = await Promise.all([
        tx.get(regsCol.where('status', '==', 'confirmed')),
        tx.get(regsCol),
        tx.get(municipalityMemberDoc(db, municipalityId, userId)),
        // The roster is read by the whole pueblo, so each row carries its own
        // photo/account/privacy copy rather than making every viewer re-read
        // `persons`. All reads must precede the writes below — Firestore
        // transactions reject a read issued after a write.
        Promise.all(registrants.map((r) => tx.get(personDoc(db, r.personId)))),
      ]);

      const isMember = memberSnap.exists;
      // Unresolvable person => no photo, no linked account, and — the safe
      // direction — treated as private, so a name we could not verify is
      // never published to the pueblo. `.data()` is where the strict
      // converter runs, so a stored doc that no longer parses throws HERE;
      // that must degrade the roster row, not fail an otherwise valid sign-up.
      const persons = personSnaps.map((snap) => (snap.exists ? tryReadPerson(snap) : null));
      const personDenorm = persons.map((person) => {
        if (!person) return { photoURL: null, personUserId: null, isPersonPublic: false };
        return {
          photoURL: person.photoURL,
          personUserId: person.userId,
          isPersonPublic: person.isPublic,
        };
      });
      // Kept out of `personDenorm` above, which is spread onto the
      // world-readable registration doc: a birth date is PII, so it goes only
      // to the organizer-gated private doc, where the roster export reads it.
      const personBirthdays = persons.map((person) => person?.birthday ?? null);

      // Semantic answer validation needs the event's field specs, so it can
      // only happen here (the input validator runs before the event is read).
      // Client-side gating in AttendeeSheet is convenience; this is the gate.
      const signupFields = eventData.signupFields;
      const validatedAnswers: SignupAnswers[] = registrants.map((registrant) => {
        const result = validateSignupAnswers(signupFields, registrant.answers);
        if (!result.ok) {
          logger.info('Rejected sign-up answers', {
            handler: 'registerToEvent',
            eventId,
            userId,
            fieldId: result.fieldId,
            reason: result.reason,
          });
          throw new HttpsError(
            'invalid-argument',
            'Faltan respuestas obligatorias o alguna no es válida.',
          );
        }
        return result.value;
      });

      // A group is seated atomically; individual sign-ups are a run of
      // groups of one, which computeGroupStatuses handles identically.
      const statuses = computeGroupStatuses({
        maxAttendees,
        existingConfirmedCount: confirmedSnap.size,
        existingTotalCount: totalSnap.size,
        groupSizes:
          groupId !== null ? [seatCount] : Array.from({ length: registrants.length }, () => 1),
      }).flat();

      const summaries: RegistrationSummary[] = [];
      const attendees: RegistrationEmailAttendee[] = [];
      // Converter rejects FieldValue sentinels on tx.set, so registeredAt is a
      // plain Date computed once per transaction (admin SDK will store it as a
      // Timestamp via the converter's toFirestore step).
      const registeredAt = new Date();
      registrants.forEach((registrant, i) => {
        const newRef = regsCol.doc();
        const { status, position } = statuses[i];
        const reg: RegistrationData = {
          userId,
          personId: registrant.personId,
          name: registrant.name,
          status,
          position,
          isMember,
          registeredAt,
          checkedInAt: null,
          paidAt: null,
          ...personDenorm[i],
          groupId,
          groupOwnerId: groupId !== null ? userId : null,
          isOpenSeat: false,
        };
        tx.set(newRef, reg);
        // Phone (when telephoneRequired), custom field answers and the
        // attendee's birth date land in a separately-gated subcollection, never
        // on the public registration doc. Keyed by reg id. Written only when
        // there is something to store.
        const answers = validatedAnswers[i] ?? {};
        const birthday = personBirthdays[i] ?? null;
        if (registrant.phone || Object.keys(answers).length > 0 || birthday) {
          tx.set(eventRegistrationPrivateDoc(db, eventId, newRef.id), {
            name: registrant.name,
            phone: registrant.phone ?? null,
            answers,
            birthday,
          });
        }
        writeRegistrationEvent(tx, db, eventId, {
          registrationId: newRef.id,
          action: 'signed_up',
          actorUserId: userId,
          subjectUserId: userId,
          personId: registrant.personId,
          name: registrant.name,
          status,
          groupId,
          at: registeredAt,
        });
        summaries.push({ id: newRef.id, status, position, isMember });
        attendees.push({ name: registrant.name, status, position });
      });

      // Open seats: real, held registrations the group owner is already
      // accountable for (they occupy capacity and, on a paid event, are owed
      // for from this moment). Each carries a single-use token in the gated
      // seatTokens subcollection — never on this world-readable doc.
      const openSeatSummaries: OpenSeatSummary[] = [];
      for (let i = 0; i < openSeats; i++) {
        const seatRef = regsCol.doc();
        const { status, position } = statuses[registrants.length + i];
        const seat: RegistrationData = {
          userId,
          personId: '',
          name: OPEN_SEAT_NAME,
          status,
          position,
          isMember: false,
          registeredAt,
          checkedInAt: null,
          paidAt: null,
          // No person behind it yet, so nothing to denormalize. Public: a
          // free seat is not somebody's hidden identity, and the roster needs
          // to render it as an invitation rather than an anonymous body.
          photoURL: null,
          personUserId: null,
          isPersonPublic: true,
          groupId,
          groupOwnerId: userId,
          isOpenSeat: true,
        };
        tx.set(seatRef, seat);

        const token = generateSeatToken();
        tx.set(
          eventSeatTokenDoc(db, eventId, token),
          buildSeatTokenData({
            registrationId: seatRef.id,
            // groupId is non-null here: openSeats > 0 only passes validation
            // on a group event, which always mints one.
            groupId: groupId ?? '',
            createdBy: userId,
            createdAt: registeredAt,
          }),
        );
        // An open seat joins the roster like any other body: it occupies a
        // place from this moment, so the log records it as one.
        writeRegistrationEvent(tx, db, eventId, {
          registrationId: seatRef.id,
          action: 'signed_up',
          actorUserId: userId,
          subjectUserId: userId,
          personId: '',
          name: OPEN_SEAT_NAME,
          status,
          groupId,
          at: registeredAt,
        });
        openSeatSummaries.push({ registrationId: seatRef.id, token });
        summaries.push({ id: seatRef.id, status, position, isMember: false });
      }

      // Maintain denormalized counters on the event doc so feeds and detail
      // pages can render "X / Y plazas" without an extra count query. Computed
      // from the snapshot sizes read at transaction start, which is the
      // source-of-truth value for this transaction's serialization point.
      // tx.update bypasses the converter, so an untyped partial is fine.
      const newConfirmed = summaries.filter((s) => s.status === 'confirmed').length;
      tx.update(eventRef, {
        confirmedCount: confirmedSnap.size + newConfirmed,
        totalCount: totalSnap.size + summaries.length,
      });

      logger.info('Registered to event', {
        handler: 'registerToEvent',
        eventId,
        userId,
        municipalityId,
        registrantCount: registrants.length,
        openSeatCount: openSeats,
        groupId,
        confirmedAdded: summaries.filter((s) => s.status === 'confirmed').length,
        waitlistedAdded: summaries.filter((s) => s.status === 'waitlisted').length,
      });

      return {
        registrations: summaries,
        openSeats: openSeatSummaries,
        attendees,
        event: eventData,
        confirmedCount: confirmedSnap.size + newConfirmed,
      };
    });

    // Deliberately outside the transaction: Firestore retries the callback on
    // contention, and a send inside it would go out once per retry. Failures
    // are swallowed and logged by sendRegistrationEmail — a bounced email must
    // not undo a completed registration.
    await sendRegistrationEmail({
      userId,
      eventId,
      event: committed.event,
      attendees: committed.attendees,
      confirmedCount: committed.confirmedCount,
      kind: 'registration',
    });

    return { registrations: committed.registrations, openSeats: committed.openSeats };
  },
);
