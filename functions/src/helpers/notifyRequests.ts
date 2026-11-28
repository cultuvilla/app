// Helpers for writing in-app notifications during the village request flows.
// Kept thin: each function creates one or more docs under
// users/{userId}/notifications/ and is invoked from the relevant callable
// after its transaction commits.

import * as admin from 'firebase-admin';
import { userNotificationsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData } from '@cultuvilla/shared/models';
import type { Sex } from '@cultuvilla/shared';
import { ambassadorTitle } from '../village/ambassador';

const db = admin.firestore();

interface NotifyOrganizerRequestResolvedInput {
  municipalityId: string;
  municipalityName: string;
  requesterUid: string;
  requesterSex: Sex | null;
  decision: 'approved' | 'rejected';
}

export async function notifyOrganizerRequestResolved(
  input: NotifyOrganizerRequestResolvedInput,
): Promise<void> {
  const approved = input.decision === 'approved';
  const ref = userNotificationsCollection(db, input.requesterUid).doc();
  await ref.set(
    buildNotificationData({
      type: approved ? 'organizer_request_approved' : 'organizer_request_rejected',
      title: approved
        ? `¡Ya eres ${ambassadorTitle(input.requesterSex)} de Cultuvilla!`
        : 'Solicitud rechazada',
      body: approved
        ? `Desde hoy representas a ${input.municipalityName} en Cultuvilla. Gracias por dar la cara por tu pueblo.`
        : `Tu solicitud para representar a ${input.municipalityName} en Cultuvilla no ha salido adelante esta vez.`,
      municipalityId: input.municipalityId,
    }),
  );
}


interface NotifyOrgJoinRequestResolvedInput {
  orgId: string;
  orgName: string;
  municipalityId: string;
  requesterUid: string;
  decision: 'approved' | 'rejected';
}

export async function notifyOrgJoinRequestResolved(
  input: NotifyOrgJoinRequestResolvedInput,
): Promise<void> {
  const approved = input.decision === 'approved';
  await userNotificationsCollection(db, input.requesterUid)
    .doc()
    .set(
      buildNotificationData({
        type: approved ? 'org_join_request_approved' : 'org_join_request_rejected',
        title: approved ? `Ya eres de ${input.orgName}` : 'Solicitud no aceptada',
        body: approved
          ? `Han aceptado tu solicitud para unirte a ${input.orgName}.`
          : `Tu solicitud para unirte a ${input.orgName} no ha sido aceptada.`,
        municipalityId: input.municipalityId,
        entityKind: 'organization',
        entityId: input.orgId,
      }),
    );
}

interface NotifyOrgJoinRequestCreatedInput {
  orgId: string;
  orgName: string;
  municipalityId: string;
  requesterUid: string;
  requesterName: string;
  adminUids: string[];
}

export async function notifyOrgJoinRequestCreated(
  input: NotifyOrgJoinRequestCreatedInput,
): Promise<void> {
  if (input.adminUids.length === 0) return;
  const batch = db.batch();
  for (const adminUid of input.adminUids) {
    batch.set(
      userNotificationsCollection(db, adminUid).doc(),
      buildNotificationData({
        type: 'org_join_request_created',
        title: `Solicitud para unirse a ${input.orgName}`,
        body: `${input.requesterName} quiere unirse a ${input.orgName}.`,
        municipalityId: input.municipalityId,
        requesterUid: input.requesterUid,
        entityKind: 'organization',
        entityId: input.orgId,
      }),
    );
  }
  await batch.commit();
}

/** A raw doc's `name`, or `fallback` — for a notice that must go out whatever the doc holds. */
export function storedName(name: unknown, fallback: string): string {
  return typeof name === 'string' && name.trim() ? name : fallback;
}

// A group asking to be listed in another pueblo. No notification type of its
// own: a new type would throw in installed binaries' converter, so these ride
// on the org request types, which already carry the group and open it.

interface NotifyOrgPresenceRequestCreatedInput {
  orgId: string;
  orgName: string;
  municipalityId: string;
  municipalityName: string;
  requesterUid: string;
  adminUids: string[];
}

/** To the asked pueblo's Equipo: answered in the Buzón; the notice opens the group. */
export async function notifyOrgPresenceRequestCreated(
  input: NotifyOrgPresenceRequestCreatedInput,
): Promise<void> {
  if (input.adminUids.length === 0) return;
  const batch = db.batch();
  for (const adminUid of input.adminUids) {
    batch.set(
      userNotificationsCollection(db, adminUid).doc(),
      buildNotificationData({
        type: 'org_join_request_created',
        title: `${input.orgName} quiere estar en ${input.municipalityName}`,
        body: `${input.orgName} pide aparecer entre los grupos de ${input.municipalityName}. Respóndele en el Buzón.`,
        municipalityId: input.municipalityId,
        requesterUid: input.requesterUid,
        entityKind: 'organization',
        entityId: input.orgId,
      }),
    );
  }
  await batch.commit();
}

interface NotifyOrgPresenceRequestResolvedInput {
  orgId: string;
  orgName: string;
  municipalityId: string;
  municipalityName: string;
  adminUids: string[];
  decision: 'approved' | 'rejected';
}

/** To the group's admins, either way. */
export async function notifyOrgPresenceRequestResolved(
  input: NotifyOrgPresenceRequestResolvedInput,
): Promise<void> {
  if (input.adminUids.length === 0) return;
  const approved = input.decision === 'approved';
  const batch = db.batch();
  for (const adminUid of input.adminUids) {
    batch.set(
      userNotificationsCollection(db, adminUid).doc(),
      buildNotificationData({
        type: approved ? 'org_approved' : 'org_rejected',
        title: approved
          ? `${input.orgName} ya está en ${input.municipalityName}`
          : `${input.municipalityName} no ha aceptado a ${input.orgName}`,
        body: approved
          ? `${input.orgName} aparece ya entre los grupos de ${input.municipalityName}.`
          : `El equipo de ${input.municipalityName} no ha aceptado que ${input.orgName} aparezca en su pueblo.`,
        municipalityId: input.municipalityId,
        entityKind: 'organization',
        entityId: input.orgId,
      }),
    );
  }
  await batch.commit();
}
