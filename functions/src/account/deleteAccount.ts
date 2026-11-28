import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
// Subpath import (not the '@cultuvilla/shared' barrel): the barrel pulls
// react-native into the functions esbuild bundle. See helpers/membershipAudit.ts.
import {
  FRESH_AUTH_CLOCK_SKEW_SEC,
  FRESH_AUTH_WINDOW_SEC,
  REAUTH_REQUIRED_REASON,
  type DeleteAccountRequest,
} from '@cultuvilla/shared/models';
import { computeDeletionBlockers } from './blockers';
import { runUidCascade } from './cascade/runner';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

interface DeleteAccountResult {
  ok: true;
}

/**
 * RGPD/GDPR account erasure. Irreversible, destructive: run only after the
 * user has re-authenticated on the client.
 *
 *  1. Auth guard, then the fresh-auth gate: a caller that says it can
 *     reauthenticate (`reauth: true`) must have signed in within
 *     FRESH_AUTH_WINDOW_SEC, or it gets `failed-precondition` with
 *     `details.reason = REAUTH_REQUIRED_REASON` and nothing is touched.
 *     Older binaries send no data and are not gated, so they are not
 *     stranded; the gate becomes unconditional once `minSupported` passes the
 *     first version that sends the flag.
 *  2. Re-run the sole-admin blocker check server-side — the client's preview is
 *     never trusted. Any blocker aborts BEFORE anything is deleted.
 *  3. Run the uid cascade (cascade/registry.ts): every collection that holds a
 *     uid is deleted, anonymised, left to its projection trigger or kept with a
 *     reason, and accountDeletionCoverage.test.ts fails when one is in none.
 *  4. Delete the Firebase Auth user last — once the data is gone the auth
 *     record has nothing left to protect, and doing it last means a mid-way
 *     failure leaves the account still sign-in-able for a retry.
 */
export const deleteAccount = defineCallable<DeleteAccountRequest | undefined, Promise<DeleteAccountResult>>(
  'deleteAccount',
  { cors: true },
  async (request) => {
    const handler = 'deleteAccount';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const uid = auth.uid;

    if (request.data?.reauth === true && !isFreshAuth(auth.token.auth_time, Date.now())) {
      logger.info('account deletion needs a recent sign-in', {
        handler,
        uid,
        authTime: auth.token.auth_time,
      });
      throw new HttpsError(
        'failed-precondition',
        'Vuelve a iniciar sesión para eliminar tu cuenta.',
        { reason: REAUTH_REQUIRED_REASON },
      );
    }

    const blockers = await computeDeletionBlockers(db, uid);
    if (blockers.length > 0) {
      throw new HttpsError(
        'failed-precondition',
        'No puedes eliminar tu cuenta mientras seas la única persona al frente de un pueblo u organización. Nombra a alguien más primero.',
      );
    }

    const counts = await runUidCascade(db, uid);

    await getAuth().deleteUser(uid);

    logger.info('account deleted', { handler, uid, ...counts });
    return { ok: true };
  },
);

/** `authTime` is the ID token's `auth_time` claim, in seconds since the epoch. */
export function isFreshAuth(authTime: unknown, nowMs: number): boolean {
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) return false;
  const ageSec = nowMs / 1000 - authTime;
  return ageSec <= FRESH_AUTH_WINDOW_SEC && ageSec >= -FRESH_AUTH_CLOCK_SKEW_SEC;
}
