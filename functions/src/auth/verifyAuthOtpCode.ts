import { createHash } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { isValidEmail } from '@cultuvilla/shared/utils';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { authOtpCodeDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { getAuth } from 'firebase-admin/auth';
import { bucketIdFor } from './rateLimit';

const handler = 'verifyAuthOtpCode';

const MAX_ATTEMPTS = 5;

interface VerifyAuthOtpCodeData {
  email?: string;
  code?: string;
}

interface VerifyAuthOtpCodeResult {
  token: string;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Core logic, separated from the onCall envelope so it is unit-testable. */
export async function runVerifyAuthOtpCode(
  data: VerifyAuthOtpCodeData | undefined,
): Promise<VerifyAuthOtpCodeResult> {
  const email = data?.email;
  const code = data?.code;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    throw new HttpsError('invalid-argument', 'Email inválido.');
  }
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Código inválido.');
  }

  const trimmedEmail = email.trim();
  const bucketId = bucketIdFor(trimmedEmail.toLowerCase());
  const db = getFirestore();
  const ref = authOtpCodeDoc(db, bucketId);

  const matched = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const otp = snap.data();
    if (!otp) return false;
    if (otp.expiresAt.getTime() < Date.now()) return false;
    if (otp.attempts >= MAX_ATTEMPTS) return false;
    if (otp.codeHash !== hashCode(code)) {
      tx.update(ref, { attempts: otp.attempts + 1 });
      return false;
    }
    tx.delete(ref);
    return true;
  });

  if (!matched) {
    logger.warn('auth otp verify rejected', { handler, bucketId });
    throw new HttpsError('invalid-argument', 'Código incorrecto o caducado.');
  }

  const auth = getAuth();
  let uid: string;
  try {
    const user = await auth.getUserByEmail(trimmedEmail);
    uid = user.uid;
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== 'auth/user-not-found') {
      logger.error('getUserByEmail failed', {
        handler,
        bucketId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new HttpsError('internal', 'No se pudo verificar el código. Inténtalo de nuevo.');
    }
    const created = await auth.createUser({ email: trimmedEmail });
    uid = created.uid;
  }

  const token = await auth.createCustomToken(uid);
  logger.info('auth otp verified', { handler, bucketId });
  return { token };
}

export const verifyAuthOtpCode = onCall<VerifyAuthOtpCodeData, Promise<VerifyAuthOtpCodeResult>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    // Unauthenticated by design — this IS the sign-in step.
    return runVerifyAuthOtpCode(request.data);
  },
);
