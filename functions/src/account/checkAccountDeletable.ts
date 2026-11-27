import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { computeDeletionBlockers, type DeletionBlocker } from './blockers';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

interface CheckAccountDeletableResult {
  blockers: DeletionBlocker[];
}

/**
 * Read-only preview for the account-deletion flow: reports the villages/orgs
 * where the caller is the SOLE admin. The client surfaces these as blockers
 * the user must resolve (promote another admin, or transfer/disband) before
 * `deleteAccount` (Task 7) will proceed — which re-runs this exact check
 * server-side rather than trusting the client's read.
 */
export const checkAccountDeletable = defineCallable<undefined, Promise<CheckAccountDeletableResult>>(
  'checkAccountDeletable',
  { cors: true },
  async (request) => {
    const handler = 'checkAccountDeletable';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const callerUid = auth.uid;
    const blockers = await computeDeletionBlockers(db, callerUid);

    logger.info('checked account deletable', { handler, callerUid, blockerCount: blockers.length });
    return { blockers };
  },
);
