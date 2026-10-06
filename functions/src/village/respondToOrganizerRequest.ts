import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityDoc,
  municipalityMemberDoc,
  organizerRequestDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import type { VillageMemberData } from '@cultuvilla/shared';
import { notifyOrganizerRequestResolved } from '../helpers/notifyRequests';
import { writeMembershipEvent } from '../helpers/membershipAudit';
import { readResidenceTarget, upsertResidenceLink, type ResidenceTarget } from './residenceProjection';
import { readOwnSex } from './ambassador';
import type { Sex } from '@cultuvilla/shared';

const db = getFirestore();

interface RespondToOrganizerRequestData {
  requestId?: string;
  decision?: 'approved' | 'rejected';
}

interface RespondToOrganizerRequestResult {
  ok: true;
}

export const respondToOrganizerRequest = onCall<
  RespondToOrganizerRequestData,
  Promise<RespondToOrganizerRequestResult>
>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'respondToOrganizerRequest';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { requestId, decision } = request.data;
    if (!requestId || (decision !== 'approved' && decision !== 'rejected')) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }

    const callerUid = auth.uid;
    const adminSnap = await adminDoc(db, callerUid).get();
    if (!adminSnap.exists) {
      throw new HttpsError('permission-denied', 'Sólo superadmin.');
    }

    const reqRef = organizerRequestDoc(db, requestId);
    let requesterUid = '';
    let municipalityId = '';
    let municipalityName = '';
    let requesterSex: Sex | null = null;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
      // Converter-wrapped: typed OrganizerRequestData.
      const reqData = snap.data();
      if (reqData?.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'La solicitud ya fue resuelta.');
      }

      requesterUid = reqData.userId;
      municipalityId = reqData.municipalityId;
      const muniRef = municipalityDoc(db, municipalityId);
      const memberRef = municipalityMemberDoc(db, municipalityId, requesterUid);
      // All reads before any write (transaction requirement).
      const [muniSnap, memberSnap] = await Promise.all([tx.get(muniRef), tx.get(memberRef)]);
      if (!muniSnap.exists) throw new HttpsError('not-found', 'Pueblo no encontrado.');
      // Converter-wrapped: typed MunicipalityData.
      const muniData = muniSnap.data();
      if (decision === 'approved') {
        // Activation is decoupled: the village must already be started, and it
        // must not already have an organizer. Granting just sets the organizer
        // and promotes the requester to admin — it never creates the community.
        if (muniData?.communityActive !== true) {
          throw new HttpsError('failed-precondition', 'El pueblo aún no está iniciado.');
        }
        if (muniData.community?.organizerId != null) {
          throw new HttpsError('already-exists', 'Este pueblo ya tiene embajador.');
        }
      }
      municipalityName = muniData?.name ?? municipalityId;

      // Residence link projection for a requester who is NOT yet a member and
      // will be seeded as admin below. Read before any write (tx requirement);
      // the upsert happens in the fresh-member branch. Already-members keep the
      // residence link they got when they joined/started the village.
      let residenceTarget: ResidenceTarget | null = null;
      if (decision === 'approved' && !memberSnap.exists) {
        residenceTarget = await readResidenceTarget(tx, db, requesterUid);
      }
      if (decision === 'approved') {
        requesterSex = await readOwnSex(tx, db, requesterUid);
      }

      // tx.update bypasses the converter — FieldValue.serverTimestamp() is fine.
      tx.update(reqRef, {
        status: decision,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: callerUid,
      });

      if (decision === 'approved') {
        // Set the organizer on the existing community (dotted path preserves the
        // description/profileForm/activatedAt seeded at start time).
        // Untyped ref: UpdateData can't express a dotted path into a nullable
        // nested field, so a null organizerSex fails to typecheck otherwise.
        tx.update(muniRef.withConverter(null), {
          'community.organizerId': requesterUid,
          'community.organizerSex': requesterSex,
        });
        const priorRole = memberSnap.exists ? (memberSnap.data()?.role ?? null) : null;
        if (memberSnap.exists) {
          // Already a member (joined or started the village) → promote to admin.
          tx.update(memberRef, { role: 'admin' });
        } else {
          // Converter rejects FieldValue sentinels on set; joinedAt is a plain Date.
          const newMember: VillageMemberData = {
            userId: requesterUid,
            role: 'admin',
            joinedAt: new Date(),
            profileAnswers: {},
            profileCompletedAt: null,
          };
          tx.set(memberRef, newMember);
          if (residenceTarget) upsertResidenceLink(tx, residenceTarget, municipalityId, null);
        }
        // Audit: the organizer grant, then the admin membership it establishes
        // (a promotion if they were already a member, otherwise a fresh add).
        writeMembershipEvent(tx, db, {
          scopeType: 'village',
          scopeId: municipalityId,
          municipalityId,
          actorUserId: callerUid,
          targetUserId: requesterUid,
          action: 'organizer_set',
        });
        writeMembershipEvent(tx, db, {
          scopeType: 'village',
          scopeId: municipalityId,
          municipalityId,
          actorUserId: callerUid,
          targetUserId: requesterUid,
          action: memberSnap.exists ? 'role_changed' : 'added',
          fromRole: priorRole,
          toRole: 'admin',
        });
      }
    });

    if (requesterUid && municipalityId) {
      await notifyOrganizerRequestResolved({
        municipalityId,
        municipalityName,
        requesterUid,
        requesterSex,
        decision,
      });
    }

    logger.info('organizer request resolved', { handler, requestId, decision });
    return { ok: true };
  },
);
