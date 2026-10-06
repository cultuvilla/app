import { createHash, randomInt } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { isValidEmail } from '@cultuvilla/shared/utils';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { RESEND_API_KEY } from './secret';
import { bucketIdFor, callerIpOf, checkSendRateLimits } from './rateLimit';
import { reviewOtpCodeFor } from './reviewAccess';
import { renderAuthOtpEmailHtml, renderAuthOtpEmailText, AUTH_OTP_EMAIL_SUBJECT_PREFIX } from './authEmailTemplate';
import { isFunctionsEmulator } from '../shared/runtime';

const handler = 'sendAuthOtpCode';

// Server-only infra collection, same category as `authEmailRateLimits` — no
// municipalityId, never touched by client Firestore rules (Admin SDK bypasses
// rules entirely). Doc id = bucketIdFor(email), same hashing as rate limits.
const OTP_COLLECTION = 'authOtpCodes';
const OTP_EXPIRY_MS = 10 * 60 * 1000;

interface SendAuthOtpCodeData {
  email?: string;
}

interface SendAuthOtpCodeResult {
  ok: true;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Core logic, separated from the onCall envelope so it is unit-testable. */
export async function runSendAuthOtpCode(
  data: SendAuthOtpCodeData | undefined,
  callerIp: string | null = null,
): Promise<SendAuthOtpCodeResult> {
  const email = data?.email;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    throw new HttpsError('invalid-argument', 'Email inválido.');
  }

  const trimmedEmail = email.trim();
  const bucketId = bucketIdFor(trimmedEmail.toLowerCase());

  const allowed = await checkSendRateLimits(bucketId, callerIp);
  if (!allowed) {
    // Generic response on purpose — never let a caller distinguish
    // "rate-limited" from "sent".
    logger.warn('auth otp rate limited', { handler, bucketId, reason: 'window-exceeded' });
    return { ok: true };
  }

  // A store reviewer cannot read the mailbox this code is sent to, so one
  // allowlisted address gets a fixed code instead of a random one. Everything
  // below is identical either way — same doc, same expiry, same attempt cap.
  const reviewCode = await reviewOtpCodeFor(trimmedEmail);
  const code = reviewCode ?? generateCode();
  const db = getFirestore();
  // Locally there is no Resend key and no mailbox to read it from, so the send
  // below throws and the sign-in flow cannot be completed by any means — not by
  // hand against a dev client, not by an E2E driver. Under the emulator the code
  // is kept in plaintext on the doc (and logged) instead of emailed.
  // `authOtpCodes` is Admin-SDK-only and unreadable by clients, the field is
  // never written outside the emulator, and verification ignores it entirely.
  const emulator = isFunctionsEmulator();
  await db
    .collection(OTP_COLLECTION)
    .doc(bucketId)
    .set({
      codeHash: hashCode(code),
      expiresAt: Timestamp.fromMillis(Date.now() + OTP_EXPIRY_MS),
      attempts: 0,
      createdAt: Timestamp.now(),
      ...(emulator ? { emulatorCode: code } : {}),
    });

  if (emulator) {
    logger.info('auth otp code issued (emulator, not emailed)', { handler, bucketId, code });
    return { ok: true };
  }

  // Nothing to deliver: the reviewer already has the code from the store
  // console. Logged at info so an unexpected hit is visible in Cloud Logging.
  if (reviewCode) {
    logger.info('auth otp code issued for the store-review account (not emailed)', {
      handler,
      bucketId,
    });
    return { ok: true };
  }

  const timestamp = new Date().toISOString();
  const subject = `${AUTH_OTP_EMAIL_SUBJECT_PREFIX} · ${timestamp}`;
  const html = renderAuthOtpEmailHtml({ code });
  const text = renderAuthOtpEmailText({ code });

  try {
    const resend = new Resend(RESEND_API_KEY.value());
    // The Resend SDK does not throw on API-level failures — it resolves with
    // { data: null, error } instead, so a bad request would silently look
    // like a successful send if `error` went unchecked.
    const { error } = await resend.emails.send({
      from: 'Cultuvilla <hola@acceso.cultuvilla.es>',
      to: trimmedEmail,
      replyTo: 'cultuvilla.app@gmail.com',
      subject,
      html,
      text,
    });
    if (error) {
      logger.error('resend send failed', { handler, bucketId, error: error.message });
      throw new HttpsError('internal', 'No se pudo enviar el email. Inténtalo de nuevo.');
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('resend send failed', {
      handler,
      bucketId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new HttpsError('internal', 'No se pudo enviar el email. Inténtalo de nuevo.');
  }

  logger.info('auth otp code sent', { handler, bucketId });
  return { ok: true };
}

export const sendAuthOtpCode = onCall<SendAuthOtpCodeData, Promise<SendAuthOtpCodeResult>>(
  { region: 'us-central1', cors: true, secrets: [RESEND_API_KEY] },
  async (request) => {
    // Unauthenticated by design: this is the entry point that lets a signed-out
    // user request a sign-in code in the first place.
    return runSendAuthOtpCode(request.data, callerIpOf(request.rawRequest));
  },
);
