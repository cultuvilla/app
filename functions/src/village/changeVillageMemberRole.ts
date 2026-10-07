import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityDoc,
  municipalityMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { writeMembershipEvent } from '../helpers/membershipAudit';

const db = getFirestore();

interface ChangeVillageMemberRoleData {
  municipalityId?: string;
  targetUserId?: string;
  role?: 'admin' | 'user';
}

interface ChangeVillageMemberRoleResult {
  ok: true;
}

/**
 * Promote/demote a village member's role. The single audited path for creating
 * (or removing) a village admin — clients can no longer write `role` directly
 * (firestore.rules pins client-created members to `role:'user'` and forbids
 * client `role` updates).
 *
 * Authority: a village admin of the municipality, or an app admin. The change
 * and its `membershipEvents` audit record commit in one transaction.
 *
 * Guard: refuses to demote the current organizer below admin — the organizer
 * pointer would then dangle on a non-admin. Move the title first with
 * transferVillageAmbassador.
 */
export const changeVillageMemberRole = onCall<
  ChangeVillageMemberRoleData,
  Promise<ChangeVillageMemberRoleResult>
>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'changeVillageMemberRole';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { municipalityId, targetUserId, role } = request.data;
    if (!municipalityId || !targetUserId || (role !== 'admin' && role !== 'user')) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }

    const callerUid = auth.uid;

    await db.runTransaction(async (tx) => {
      const callerMemberRef = municipalityMemberDoc(db, municipalityId, callerUid);
      const targetMemberRef = municipalityMemberDoc(db, municipalityId, targetUserId);
      const appAdminRef = adminDoc(db, callerUid);
      const muniRef = municipalityDoc(db, municipalityId);
      // All reads before any write (transaction requirement).
      const [callerSnap, targetSnap, appAdminSnap, muniSnap] = await Promise.all([
        tx.get(callerMemberRef),
        tx.get(targetMemberRef),
        tx.get(appAdminRef),
        tx.get(muniRef),
      ]);

      const isAppAdmin = appAdminSnap.exists;
      const isVillageAdmin = callerSnap.exists && callerSnap.data()?.role === 'admin';
      if (!isAppAdmin && !isVillageAdmin) {
        throw new HttpsError('permission-denied', 'No autorizado.');
      }
      if (!targetSnap.exists) {
        throw new HttpsError('not-found', 'El usuario no es miembro de este pueblo.');
      }

      const currentRole = targetSnap.data()?.role ?? null;
      if (currentRole === role) {
        // No change — nothing to update or record.
        return;
      }

      // Converter-wrapped read: typed MunicipalityData.
      const organizerId = muniSnap.data()?.community?.organizerId ?? null;
      if (role === 'user' && organizerId === targetUserId) {
        throw new HttpsError(
          'failed-precondition',
          'No puedes quitar al embajador del equipo. Cede primero el título de embajador a otra persona.',
        );
      }

      // tx.update bypasses the converter — a single-field patch is fine.
      tx.update(targetMemberRef, { role });
      writeMembershipEvent(tx, db, {
        scopeType: 'village',
        scopeId: municipalityId,
        municipalityId,
        actorUserId: callerUid,
        targetUserId,
        action: 'role_changed',
        fromRole: currentRole,
        toRole: role,
      });
    });

    logger.info('village member role changed', {
      handler,
      callerUid,
      municipalityId,
      targetUserId,
      role,
    });
    return { ok: true };
  },
);
