import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  organizationDoc,
  organizationSociosCollection,
  userDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildSocioData, hasSocioRoster } from '@cultuvilla/shared/models';

const db = getFirestore();

/**
 * Gives a joining member their socio row. Reuses an active row that already
 * names them — idempotent on a retry — and otherwise takes over the active
 * persona row of their own profile (a persona a cargo who joined with their own
 * account), keeping its alta. Otherwise a new row, alta on the join date.
 */
export async function giveSocioAlta(
  firestore: Firestore,
  orgId: string,
  uid: string,
  joinedAt: Date,
): Promise<'exists' | 'adopted' | 'created'> {
  const socios = organizationSociosCollection(firestore, orgId);
  const user = (await userDoc(firestore, uid).get()).data();
  const personId = user?.personId ?? null;

  return firestore.runTransaction(async (tx) => {
    const own = await tx.get(socios.where('uid', '==', uid).where('bajaAt', '==', null));
    if (!own.empty) return 'exists';

    if (personId) {
      const persona = await tx.get(
        socios.where('personId', '==', personId).where('kind', '==', 'persona').where('bajaAt', '==', null),
      );
      const row = persona.empty ? undefined : persona.docs[0];
      if (row) {
        tx.update(row.ref, { kind: 'member', uid, responsibleUid: null });
        return 'adopted';
      }
    }

    tx.set(
      socios.doc(),
      buildSocioData({
        kind: 'member',
        displayName: user?.displayName ?? '',
        uid,
        personId,
        altaAt: joinedAt,
        createdBy: uid,
      }),
    );
    return 'created';
  });
}

/** A member left: their row and the personas a cargo they answered for get the baja. */
async function giveSocioBaja(firestore: Firestore, orgId: string, uid: string): Promise<number> {
  const socios = organizationSociosCollection(firestore, orgId);
  const [own, personas] = await Promise.all([
    socios.where('uid', '==', uid).where('bajaAt', '==', null).get(),
    socios.where('responsibleUid', '==', uid).where('bajaAt', '==', null).get(),
  ]);
  const rows = [...own.docs, ...personas.docs];
  if (rows.length === 0) return 0;
  const batch = firestore.batch();
  for (const row of rows) batch.update(row.ref, { bajaAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return rows.length;
}

/** A demoted admin keeps no title: titles belong to the junta only. */
async function clearAdminTitle(firestore: Firestore, orgId: string, uid: string): Promise<void> {
  const own = await organizationSociosCollection(firestore, orgId)
    .where('uid', '==', uid)
    .where('bajaAt', '==', null)
    .get();
  const batch = firestore.batch();
  for (const row of own.docs) {
    if (row.data().adminTitle !== null) batch.update(row.ref, { adminTitle: null });
  }
  await batch.commit();
}

/**
 * Keeps `organizations/{orgId}/socios` in step with the org's members: joining
 * is the alta, leaving the baja (the row stays — it is the libro de socios), and
 * losing the admin role drops the display title. The ayuntamiento keeps no
 * roster. A write under an org that is already gone (the delete cascade) is a
 * no-op, so it does not recreate the org's subcollection.
 */
export const syncOrgSocioRoster = onDocumentWritten(
  { document: 'organizations/{orgId}/members/{userId}', region: 'us-central1' },
  async (event) => {
    const handler = 'syncOrgSocioRoster';
    const { orgId, userId } = event.params;
    const before = event.data?.before;
    const after = event.data?.after;

    const org = (await organizationDoc(db, orgId).get()).data();
    if (!org || !hasSocioRoster(org.type)) return;

    if (!before?.exists && after?.exists) {
      const joinedAt = (after.get('joinedAt') as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? new Date();
      const outcome = await giveSocioAlta(db, orgId, userId, joinedAt);
      logger.info('socio alta', { handler, orgId, userId, outcome });
    } else if (before?.exists && !after?.exists) {
      const count = await giveSocioBaja(db, orgId, userId);
      logger.info('socio baja', { handler, orgId, userId, count });
    } else if (before?.get('role') === 'admin' && after?.get('role') !== 'admin') {
      await clearAdminTitle(db, orgId, userId);
      logger.info('socio admin title cleared', { handler, orgId, userId });
    }
  },
);
