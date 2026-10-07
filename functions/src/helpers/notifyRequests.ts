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
