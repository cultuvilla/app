/**
 * Transport for the event mails rendered by `@cultuvilla/shared/email`:
 * resolves the recipient's address off their user doc and hands the rendered
 * message to Resend.
 *
 * Best-effort by contract: a failure here must never fail the write that
 * triggered it. Every path logs and returns instead of throwing — the seat is
 * booked (or gone) whether or not the mail server cooperated, and the in-app
 * notification is the durable record.
 */

import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { userDoc } from "@cultuvilla/shared/firebase/refs/admin";
import { Resend } from "resend";
import { RESEND_API_KEY } from "../auth/secret";
import { isFunctionsEmulator } from "../shared/runtime";
import {
  registrationEmailSubject,
  renderRegistrationEmailHtml,
  renderRegistrationEmailText,
  type RegistrationEmailContent,
} from "@cultuvilla/shared/email";

const db = getFirestore();

const FROM = "Cultuvilla <hola@acceso.cultuvilla.es>";
const REPLY_TO = "cultuvilla.app@gmail.com";

export interface SendEventEmailArgs {
  handler: string;
  userId: string;
  eventId: string;
  content: RegistrationEmailContent;
}

export async function sendEventEmail(args: SendEventEmailArgs): Promise<void> {
  const { handler, userId, eventId, content } = args;

  if (content.attendees.length === 0) return;

  let email: string;
  try {
    // Converter-wrapped: a nonconforming user doc throws here and is caught
    // below, costing an email rather than the write that triggered it.
    const snap = await userDoc(db, userId).get();
    const rawEmail = snap.data()?.email;
    if (typeof rawEmail !== "string" || rawEmail.trim() === "") {
      // Walk-in registrations carry no user account, and a user doc can lag
      // behind auth. Neither is an error worth alerting on.
      logger.info("No email on file; skipping event email", {
        handler,
        eventId,
        userId,
        kind: content.kind,
      });
      return;
    }
    email = rawEmail.trim();
  } catch (err) {
    logger.error("Could not load user for event email", {
      handler,
      eventId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // The emulator has no RESEND_API_KEY, so every send failed with "Missing API
  // key" at error severity and buried real failures in E2E logs. No mail
  // leaves an emulator anyway.
  if (isFunctionsEmulator()) {
    logger.info("Event email skipped (functions emulator)", {
      handler,
      eventId,
      userId,
      kind: content.kind,
    });
    return;
  }

  try {
    const resend = new Resend(RESEND_API_KEY.value());
    // The Resend SDK resolves with { data: null, error } on API-level failures
    // rather than throwing, so an unchecked `error` would look like a success.
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      replyTo: REPLY_TO,
      subject: registrationEmailSubject(content),
      html: renderRegistrationEmailHtml(content),
      text: renderRegistrationEmailText(content),
    });
    if (error) {
      logger.error("resend send failed", {
        handler,
        eventId,
        userId,
        error: error.message,
      });
      return;
    }
  } catch (err) {
    logger.error("resend send failed", {
      handler,
      eventId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  logger.info("Event email sent", {
    handler,
    eventId,
    userId,
    kind: content.kind,
    attendeeCount: content.attendees.length,
  });
}
