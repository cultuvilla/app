import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  organizationSocioDoc,
  organizationSocioNumberingDoc,
  organizationSociosCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import { nextSocioNumber } from '@cultuvilla/shared/models';

const db = getFirestore();

export type AssignOutcome = { assigned: number } | 'already-numbered' | 'gone';

/**
 * Gives a new socio row the group's next number, unless it came with one (an
 * admin's typing, the import). Every assignment writes the org's counter doc
 * in the same transaction, so two rows created at once are serialized on it
 * and never share a number — a query for the highest number alone would not
 * conflict, since each transaction writes only its own row.
 */
export async function assignNextSocioNumber(firestore: Firestore, orgId: string, socioId: string): Promise<AssignOutcome> {
  return firestore.runTransaction(async (tx) => {
    const socioRef = organizationSocioDoc(firestore, orgId, socioId);
    const counterRef = organizationSocioNumberingDoc(firestore, orgId);
    const [socio, counter, highest] = await Promise.all([
      tx.get(socioRef),
      tx.get(counterRef),
      tx.get(organizationSociosCollection(firestore, orgId).orderBy('socioNumber', 'desc').limit(1)),
    ]);
    const row = socio.data();
    if (!row) return 'gone';
    if (row.socioNumber !== null) return 'already-numbered';
    const number = nextSocioNumber(counter.data()?.lastNumber ?? 0, highest.docs[0]?.data().socioNumber ?? null);
    tx.update(socioRef, { socioNumber: number });
    tx.set(counterRef, { lastNumber: number });
    return { assigned: number };
  });
}

/**
 * Numbers every socio row created without a number — member rows from
 * `syncOrgSocioRoster`, personas a cargo, typed-in socios. Rows from before
 * numbering existed keep null until an admin numbers them (see the
 * `socio-number` backfill).
 */
export const assignSocioNumber = onDocumentCreated(
  { document: 'organizations/{orgId}/socios/{socioId}', region: 'us-central1' },
  async (event) => {
    const handler = 'assignSocioNumber';
    const { orgId, socioId } = event.params;
    if (event.data?.get('socioNumber') != null) return;
    const outcome = await assignNextSocioNumber(db, orgId, socioId);
    logger.info('socio number', { handler, orgId, socioId, outcome: typeof outcome === 'string' ? outcome : 'assigned', socioNumber: typeof outcome === 'string' ? null : outcome.assigned });
  },
);
