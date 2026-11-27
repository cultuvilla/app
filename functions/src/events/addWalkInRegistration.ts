import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
  eventDoc,
  eventRegistrationsCollection,
  eventRegistrationPrivateDoc,
  municipalityMemberDoc,
  adminDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import type { RegistrationData } from '@cultuvilla/shared/models';
import { validateSignupAnswers } from '@cultuvilla/shared/models';
import { computeStatuses } from '../helpers/registerToEventValidation';
import { isWalkInAuthorized } from '../helpers/walkInAuthorization';
import { writeRegistrationEvent } from '../helpers/registrationAudit';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

interface AddWalkInData {
  eventId?: string;
  name?: string;
  phone?: string;
  /** The organizer fills the event's custom fields on the walk-in's behalf. */
  answers?: Record<string, unknown>;
}

interface AddWalkInResult {
  registration: { id: string; status: 'confirmed' | 'waitlisted'; position: number };
}

// An organizer (org member of the event's org, village admin, or app admin)
// adds a walk-in attendee with no user account. The registration carries an
// empty userId/personId; the same capacity/waitlist logic and counter updates
// as registerToEvent apply.
export const addWalkInRegistration = defineCallable<AddWalkInData, Promise<AddWalkInResult>>(
  'addWalkInRegistration',
  { cors: true },
  async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const eventId = typeof request.data.eventId === 'string' ? request.data.eventId.trim() : '';
    const name = typeof request.data.name === 'string' ? request.data.name.trim() : '';
    const phone =
      typeof request.data.phone === 'string' && request.data.phone.trim()
        ? request.data.phone.trim()
        : undefined;
    if (!eventId) throw new HttpsError('invalid-argument', 'eventId requerido.');
    if (!name) throw new HttpsError('invalid-argument', 'name requerido.');

    const uid = auth.uid;
    const eventRef = eventDoc(db, eventId);
    const regsCol = eventRegistrationsCollection(db, eventId);

    return db.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      const eventData = eventSnap.data();
      if (!eventData) throw new HttpsError('not-found', 'El evento no existe.');

      // Authorize: named organizer (organizerUserIds) OR village admin OR app admin.
      // Orgs listed in organizerOrgIds grant no implicit control.
      const organizerUserIds: string[] = Array.isArray(eventData.organizerUserIds)
        ? eventData.organizerUserIds
        : [];
      const [villageMemberSnap, appAdminSnap] = await Promise.all([
        tx.get(municipalityMemberDoc(db, eventData.municipalityId, uid)),
        tx.get(adminDoc(db, uid)),
      ]);
      const authorized = isWalkInAuthorized({
        uid,
        organizerUserIds,
        isVillageAdmin: villageMemberSnap.exists && villageMemberSnap.data()?.role === 'admin',
        isAppAdmin: appAdminSnap.exists,
      });
      if (!authorized) {
        logger.info('Walk-in authorization denied', {
          handler: 'addWalkInRegistration',
          eventId,
          uid,
        });
        throw new HttpsError('permission-denied', 'Solo un organizador puede añadir asistentes.');
      }

      const answersResult = validateSignupAnswers(eventData.signupFields, request.data.answers);
      if (!answersResult.ok) {
        logger.info('Rejected walk-in answers', {
          handler: 'addWalkInRegistration',
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

      const [confirmedSnap, totalSnap] = await Promise.all([
        tx.get(regsCol.where('status', '==', 'confirmed')),
        tx.get(regsCol),
      ]);
      const [{ status, position }] = computeStatuses({
        maxAttendees: eventData.maxAttendees,
        existingConfirmedCount: confirmedSnap.size,
        existingTotalCount: totalSnap.size,
        newCount: 1,
      });

      const newRef = regsCol.doc();
      const reg: RegistrationData = {
        userId: '',
        personId: '',
        name,
        status,
        position,
        isMember: false,
        registeredAt: new Date(),
        checkedInAt: null,
        paidAt: null,
        // A walk-in has no `persons` doc to denormalize from — no photo and no
        // account to open. The name was typed by the organizer for the roster,
        // so it is shown like any other: there is no private persona to shield.
        photoURL: null,
        personUserId: null,
        isPersonPublic: true,
        // A walk-in is the organizer's override at the door, so it is never
        // part of a group even on an event that requires them: the person is
        // already standing there, and refusing them for want of a partner
        // would be the rule serving itself.
        groupId: null,
        groupOwnerId: null,
        isOpenSeat: false,
      };
      tx.set(newRef, reg);
      if (phone || Object.keys(answers).length > 0) {
        tx.set(eventRegistrationPrivateDoc(db, eventId, newRef.id), {
          name,
          phone: phone ?? null,
          answers,
          // No persons doc behind a walk-in, so no birth date to denormalize —
          // written explicitly so every private doc carries the same shape.
          birthday: null,
        });
      }
      // A walk-in has no `userId` — nobody signed themselves up. The organizer
      // is both actor and the only account involved, which is exactly what the
      // log needs to say.
      writeRegistrationEvent(tx, db, eventId, {
        registrationId: newRef.id,
        action: 'walk_in_added',
        actorUserId: uid,
        subjectUserId: '',
        personId: '',
        name,
        status,
        at: reg.registeredAt,
      });

      tx.update(eventRef, {
        confirmedCount: confirmedSnap.size + (status === 'confirmed' ? 1 : 0),
        totalCount: totalSnap.size + 1,
      });

      logger.info('Walk-in registration added', {
        handler: 'addWalkInRegistration',
        eventId,
        uid,
        status,
      });

      return { registration: { id: newRef.id, status, position } };
    });
  },
);
