import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityDoc,
  municipalityMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { writeMembershipEvent } from '../helpers/membershipAudit';
import { readOwnSex } from './ambassador';

const db = getFirestore();

interface TransferVillageAmbassadorData {
  municipalityId?: string;
  targetUserId?: string;
}

interface TransferVillageAmbassadorResult {
  ok: true;
}

/**
 * Hand a pueblo's single Embajador title (`community.organizerId`) to another
 * member. The target is promoted to admin if they were not already; the
 * outgoing Embajador keeps their admin role and stays on the team — stepping
 * down from the title is not leaving the pueblo.
 *
 * Authority: the current Embajador, or an app admin (who can also appoint one
 * where the pointer is null). Team admins cannot move the title: it is one per
 * pueblo precisely so it cannot be claimed laterally.
 */
export const transferVillageAmbassador = onCall<
  TransferVillageAmbassadorData,
  Promise<TransferVillageAmbassadorResult>
>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'transferVillageAmbassador';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { municipalityId, targetUserId } = request.data;
    if (!municipalityId || !targetUserId) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }
    const callerUid = auth.uid;

    await db.runTransaction(async (tx) => {
      const muniRef = municipalityDoc(db, municipalityId);
      const targetRef = municipalityMemberDoc(db, municipalityId, targetUserId);
      // All reads before any write (transaction requirement).
      const [muniSnap, targetSnap, appAdminSnap] = await Promise.all([
        tx.get(muniRef),
        tx.get(targetRef),
        tx.get(adminDoc(db, callerUid)),
      ]);
      const community = muniSnap.data()?.community;
      if (!muniSnap.exists || !community) {
        throw new HttpsError('failed-precondition', 'El pueblo aún no está iniciado.');
      }
      const isAppAdmin = appAdminSnap.exists;
      if (!isAppAdmin && community.organizerId !== callerUid) {
        throw new HttpsError('permission-denied', 'No autorizado.');
      }
      if (!targetSnap.exists) {
        throw new HttpsError('not-found', 'El usuario no es miembro de este pueblo.');
      }
      if (community.organizerId === targetUserId) return;

      const targetSex = await readOwnSex(tx, db, targetUserId);
      const priorRole = targetSnap.data()?.role ?? null;

      // Untyped ref: UpdateData can't express a dotted path into a nullable
      // nested field, so a null organizerSex fails to typecheck otherwise.
      tx.update(muniRef.withConverter(null), {
        'community.organizerId': targetUserId,
        'community.organizerSex': targetSex,
      });
      writeMembershipEvent(tx, db, {
        scopeType: 'village',
        scopeId: municipalityId,
        municipalityId,
        actorUserId: callerUid,
        targetUserId,
        action: 'organizer_set',
      });
      if (priorRole !== 'admin') {
        tx.update(targetRef, { role: 'admin' });
        writeMembershipEvent(tx, db, {
          scopeType: 'village',
          scopeId: municipalityId,
          municipalityId,
          actorUserId: callerUid,
          targetUserId,
          action: 'role_changed',
          fromRole: priorRole,
          toRole: 'admin',
        });
      }
    });

    logger.info('village ambassador transferred', {
      handler,
      callerUid,
      municipalityId,
      targetUserId,
    });
    return { ok: true };
  },
);
