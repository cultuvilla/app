import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { isValidEmail } from '@cultuvilla/shared/utils';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { Resend } from 'resend';
import { RESEND_API_KEY } from './secret';
import { isFunctionsEmulator } from '../shared/runtime';
import { bucketIdFor, callerIpOf, checkSendRateLimits } from './rateLimit';
import {
  renderAuthEmailHtml,
  renderAuthEmailText,
  AUTH_EMAIL_SUBJECT_PREFIX,
} from './authEmailTemplate';

const handler = 'sendAuthSignInEmail';

interface SendAuthSignInEmailData {
  email?: string;
  continueUrl?: string;
}

interface SendAuthSignInEmailResult {
  ok: true;
}

/** Core logic, separated from the onCall envelope so it is unit-testable. */
export async function runSendAuthSignInEmail(
  data: SendAuthSignInEmailData | undefined,
  callerIp: string | null = null,
): Promise<SendAuthSignInEmailResult> {
  const email = data?.email;
  const continueUrl = data?.continueUrl;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    throw new HttpsError('invalid-argument', 'Email inválido.');
  }
  if (typeof continueUrl !== 'string' || continueUrl.trim() === '') {
    throw new HttpsError('invalid-argument', 'continueUrl requerido.');
  }

  const trimmedEmail = email.trim();
  const bucketId = bucketIdFor(trimmedEmail.toLowerCase());

  const allowed = await checkSendRateLimits(bucketId, callerIp);
  if (!allowed) {
    // Generic response on purpose — never let a caller distinguish
    // "rate-limited" from "sent" (docs/plans/ideas/branded-auth-email-delivery.md).
    logger.warn('auth email rate limited', { handler, bucketId, reason: 'window-exceeded' });
    return { ok: true };
  }

  let actionUrl: string;
  try {
    actionUrl = await getAuth().generateSignInWithEmailLink(trimmedEmail, {
      url: continueUrl,
      handleCodeInApp: true,
    });
  } catch (err) {
    logger.error('generateSignInWithEmailLink failed', {
      handler,
      bucketId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new HttpsError('internal', 'No se pudo generar el enlace de acceso. Inténtalo de nuevo.');
  }

  // Locally there is no Resend key and no mailbox, so a send can only fail (or,
  // with the placeholder secret the test runner writes, reach Resend with a fake
  // key). Log the link instead, so the flow stays completable by hand.
  if (isFunctionsEmulator()) {
    logger.info('auth sign-in link issued (emulator, not emailed)', { handler, bucketId, actionUrl });
    return { ok: true };
  }

  const timestamp = new Date().toISOString();
  const subject = `${AUTH_EMAIL_SUBJECT_PREFIX} · ${timestamp}`;
  const html = renderAuthEmailHtml({ actionUrl });
  const text = renderAuthEmailText({ actionUrl });

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

  logger.info('auth sign-in email sent', { handler, bucketId });
  return { ok: true };
}

export const sendAuthSignInEmail = onCall<
  SendAuthSignInEmailData,
  Promise<SendAuthSignInEmailResult>
>(
  { region: 'us-central1', cors: true, secrets: [RESEND_API_KEY] },
  async (request) => {
    // Unauthenticated by design: this is the entry point that lets a signed-out
    // user request a sign-in link in the first place.
    return runSendAuthSignInEmail(request.data, callerIpOf(request.rawRequest));
  },
);
