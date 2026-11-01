/**
 * The one Resend transport for every transactional email the functions send
 * (event mails, cuota reminders, group messages).
 *
 * Best-effort by contract: it never throws. Each outcome is logged and
 * returned, so a bounced or unconfigured email never fails the write or the
 * job that asked for it.
 */
import { logger } from 'firebase-functions/v2';
import { Resend } from 'resend';
import { RESEND_API_KEY } from '../auth/secret';
import { isFunctionsEmulator } from './runtime';

const FROM_ADDRESS = 'hola@acceso.cultuvilla.es';
const DEFAULT_FROM_NAME = 'Cultuvilla';
const REPLY_TO = 'cultuvilla.app@gmail.com';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Display name of the sender; the address is always Cultuvilla's. */
  fromName?: string;
  /** Where replies go: the person who wrote it, when one did. Cultuvilla's inbox otherwise. */
  replyTo?: string;
}

export interface EmailLogContext {
  handler: string;
  /** What the logs call this mail: "Event email", "Cuota reminder email". */
  label: string;
  /** Extra structured fields for every log line (ids, kinds — never the address). */
  fields?: Record<string, unknown>;
}

export type EmailOutcome = 'sent' | 'skipped' | 'failed';

/** Quotes a display name so a comma or bracket in a group's name cannot break the From header. */
function fromHeader(name: string): string {
  return `"${name.replace(/["\\\r\n]/g, '')}" <${FROM_ADDRESS}>`;
}

export async function sendEmail(email: OutgoingEmail, log: EmailLogContext): Promise<EmailOutcome> {
  const fields = { handler: log.handler, ...log.fields };

  // The emulator has no RESEND_API_KEY, so every send failed with "Missing API
  // key" at error severity and buried real failures in E2E logs. No mail
  // leaves an emulator anyway.
  if (isFunctionsEmulator()) {
    logger.info(`${log.label} skipped (functions emulator)`, fields);
    return 'skipped';
  }

  try {
    const resend = new Resend(RESEND_API_KEY.value());
    // The Resend SDK resolves with { data: null, error } on API-level failures
    // rather than throwing, so an unchecked `error` would look like a success.
    const { error } = await resend.emails.send({
      from: email.fromName ? fromHeader(email.fromName) : `${DEFAULT_FROM_NAME} <${FROM_ADDRESS}>`,
      to: email.to,
      replyTo: email.replyTo ?? REPLY_TO,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) {
      logger.error('resend send failed', { ...fields, error: error.message });
      return 'failed';
    }
  } catch (err) {
    logger.error('resend send failed', { ...fields, error: err instanceof Error ? err.message : String(err) });
    return 'failed';
  }

  logger.info(`${log.label} sent`, fields);
  return 'sent';
}

/** Resend's batch endpoint takes at most 100 emails per call. */
const BATCH_LIMIT = 100;

/**
 * Many emails at once — a group message to every socio. Resend rate-limits
 * single sends per second, so one request per hundred mails is what keeps a
 * 300-socio group inside a callable's time. A batch is all-or-nothing, so each
 * chunk's outcome is every one of its emails'. Never throws.
 */
export async function sendEmailBatch(emails: OutgoingEmail[], log: EmailLogContext): Promise<EmailOutcome[]> {
  const fields = { handler: log.handler, ...log.fields };
  if (emails.length === 0) return [];
  if (isFunctionsEmulator()) {
    logger.info(`${log.label} batch skipped (functions emulator)`, { ...fields, count: emails.length });
    return emails.map(() => 'skipped');
  }

  const resend = new Resend(RESEND_API_KEY.value());
  const outcomes: EmailOutcome[] = [];
  for (let start = 0; start < emails.length; start += BATCH_LIMIT) {
    const chunk = emails.slice(start, start + BATCH_LIMIT);
    let outcome: EmailOutcome = 'sent';
    try {
      const { error } = await resend.batch.send(
        chunk.map((email) => ({
          from: email.fromName ? fromHeader(email.fromName) : `${DEFAULT_FROM_NAME} <${FROM_ADDRESS}>`,
          to: email.to,
          replyTo: email.replyTo ?? REPLY_TO,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })),
      );
      if (error) {
        logger.error('resend batch send failed', { ...fields, count: chunk.length, error: error.message });
        outcome = 'failed';
      }
    } catch (err) {
      logger.error('resend batch send failed', { ...fields, count: chunk.length, error: err instanceof Error ? err.message : String(err) });
      outcome = 'failed';
    }
    outcomes.push(...chunk.map(() => outcome));
  }
  logger.info(`${log.label} batch done`, { ...fields, count: emails.length, sent: outcomes.filter((o) => o === 'sent').length });
  return outcomes;
}
